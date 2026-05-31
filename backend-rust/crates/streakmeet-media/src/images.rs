use anyhow::{Context, Result, anyhow};
use image::GenericImageView;
use image::imageops::FilterType;
use rgb::FromSlice;
use sha2::{Digest, Sha256};
use sqlx::PgPool;

/// Caps decode/encode cost for meet photos and remote selfies (matches frontend `prepareImageUpload`).
pub const DEFAULT_MAX_EDGE: u32 = 1600;
/// Avatars are shown small; no need to encode multi‑megapixel AVIF.
pub const AVATAR_MAX_EDGE: u32 = 512;

#[derive(Clone, Copy)]
pub struct SaveImageOptions {
    pub max_edge: u32,
    pub quality: f32,
    /// ravif speed 1–10 (10 = fastest encode, slightly larger files).
    pub speed: u8,
}

impl SaveImageOptions {
    pub const fn default_meet() -> Self {
        Self {
            max_edge: DEFAULT_MAX_EDGE,
            quality: 65.0,
            speed: 10,
        }
    }

    pub const fn avatar() -> Self {
        Self {
            max_edge: AVATAR_MAX_EDGE,
            quality: 60.0,
            speed: 10,
        }
    }
}

fn resize_to_max_edge(img: image::DynamicImage, max_edge: u32) -> image::DynamicImage {
    let (w, h) = img.dimensions();
    let longest = w.max(h);
    if longest <= max_edge {
        return img;
    }
    let scale = max_edge as f32 / longest as f32;
    let nw = ((w as f32) * scale).round().max(1.0) as u32;
    let nh = ((h as f32) * scale).round().max(1.0) as u32;
    img.resize(nw, nh, FilterType::Triangle)
}

fn encode_rgb_as_avif(
    rgb: &image::RgbImage,
    opts: SaveImageOptions,
) -> Result<ravif::EncodedImage> {
    let (w, h) = rgb.dimensions();
    let pixels = rgb.as_raw().as_rgb();
    ravif::Encoder::new()
        .with_quality(opts.quality)
        .with_speed(opts.speed)
        .encode_rgb(ravif::Img::new(pixels, w as usize, h as usize))
        .map_err(|e| anyhow!("avif encode failed: {e}"))
}

fn save_base64_image_as_avif_sync(
    photo_base64: &str,
    name_without_ext: &str,
    opts: SaveImageOptions,
) -> Result<(String, Vec<u8>)> {
    if !photo_base64.starts_with("data:image/") {
        return Err(anyhow!("invalid image format"));
    }

    let img = load_image(photo_base64)?;
    let img = resize_to_max_edge(img, opts.max_edge);
    let rgb = img.to_rgb8();
    let encoded = encode_rgb_as_avif(&rgb, opts)?;

    let file_name = format!("{name_without_ext}.avif");
    let relative_url = format!("/uploads/{file_name}");
    Ok((relative_url, encoded.avif_file))
}

pub fn parse_base64_image(photo_base64: &str) -> Result<Vec<u8>> {
    let base64_data = photo_base64
        .strip_prefix("data:image/")
        .and_then(|s| s.split_once(";base64,").map(|(_, b)| b))
        .ok_or_else(|| anyhow!("invalid base64 image prefix"))?;
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(base64_data)
        .context("base64 decode failed")
}

fn load_image(photo_base64: &str) -> Result<image::DynamicImage> {
    let bytes = parse_base64_image(photo_base64)?;
    image::load_from_memory(&bytes).context("image decode failed")
}

/// Normalized fingerprint — same scene gives same hash even with different JPEG compression.
pub async fn compute_photo_hash(photo_base64: &str) -> Result<String> {
    let img = load_image(photo_base64)?;
    let resized = img.resize(256, 256, FilterType::Lanczos3);
    let mut buffer = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut buffer);
    resized
        .write_to(&mut cursor, image::ImageFormat::Jpeg)
        .context("jpeg encode failed")?;
    let hash = Sha256::digest(&buffer);
    Ok(format!("{:x}", hash))
}

pub async fn hash_image_file(pool: &PgPool, relative_url: &str) -> Result<String> {
    let buf = get_object_buffer(pool, relative_url).await?;
    let hash = Sha256::digest(&buf);
    Ok(format!("{:x}", hash))
}

pub async fn get_object_buffer(pool: &PgPool, relative_url: &str) -> Result<Vec<u8>> {
    super::storage::get_object_buffer(pool, relative_url).await
}

pub async fn combine_remote_selfie_images(
    pool: &PgPool,
    photo_url_a: &str,
    photo_base64_b: &str,
    name_without_ext: &str,
) -> Result<String> {
    use image::RgbaImage;
    use image::imageops::FilterType;

    let buf_a = get_object_buffer(pool, photo_url_a).await?;
    let img_a = image::load_from_memory(&buf_a).context("decode image A")?;
    let img_b = load_image(photo_base64_b)?;

    let target_width = 960u32;
    let target_height = 540u32;

    let resized_a = img_a.resize_to_fill(target_width, target_height, FilterType::Lanczos3);
    let resized_b = img_b.resize_to_fill(target_width, target_height, FilterType::Lanczos3);

    let mut canvas = RgbaImage::new(target_width * 2, target_height);
    for (x, y, pixel) in resized_a.to_rgba8().enumerate_pixels() {
        canvas.put_pixel(x, y, *pixel);
    }
    for (x, y, pixel) in resized_b.to_rgba8().enumerate_pixels() {
        canvas.put_pixel(x + target_width, y, *pixel);
    }

    let rgb = image::DynamicImage::ImageRgba8(canvas).to_rgb8();
    let encoded = encode_rgb_as_avif(&rgb, SaveImageOptions::default_meet())?;

    let file_name = format!("{name_without_ext}.avif");
    let relative_url = format!("/uploads/{file_name}");
    super::storage::upload_avif(pool, &relative_url, &encoded.avif_file).await?;
    Ok(relative_url)
}

pub async fn save_base64_image_as_avif(
    pool: &PgPool,
    photo_base64: &str,
    name_without_ext: &str,
) -> Result<String> {
    save_base64_image_as_avif_with_opts(
        pool,
        photo_base64,
        name_without_ext,
        SaveImageOptions::default_meet(),
    )
    .await
}

pub async fn save_avatar_base64_as_avif(
    pool: &PgPool,
    photo_base64: &str,
    name_without_ext: &str,
) -> Result<String> {
    save_base64_image_as_avif_with_opts(
        pool,
        photo_base64,
        name_without_ext,
        SaveImageOptions::avatar(),
    )
    .await
}

pub async fn save_base64_image_as_avif_with_opts(
    pool: &PgPool,
    photo_base64: &str,
    name_without_ext: &str,
    opts: SaveImageOptions,
) -> Result<String> {
    let photo_base64 = photo_base64.to_string();
    let name_without_ext = name_without_ext.to_string();
    let (relative_url, bytes) = tokio::task::spawn_blocking(move || {
        save_base64_image_as_avif_sync(&photo_base64, &name_without_ext, opts)
    })
    .await
    .context("image encode task cancelled")??;

    super::storage::upload_avif(pool, &relative_url, &bytes).await?;
    Ok(relative_url)
}
