use anyhow::{anyhow, Context, Result};
use image::imageops::FilterType;
use image::GenericImageView;
use rgb::FromSlice;
use sha2::{Digest, Sha256};

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

pub async fn hash_image_file(relative_url: &str) -> Result<String> {
    let buf = get_object_buffer(relative_url).await?;
    let hash = Sha256::digest(&buf);
    Ok(format!("{:x}", hash))
}

pub async fn get_object_buffer(relative_url: &str) -> Result<Vec<u8>> {
    super::storage::get_object_buffer(relative_url).await
}

pub async fn combine_remote_selfie_images(
    photo_url_a: &str,
    photo_base64_b: &str,
    name_without_ext: &str,
) -> Result<String> {
    use image::imageops::FilterType;
    use image::{GenericImage, RgbaImage};

    let buf_a = get_object_buffer(photo_url_a).await?;
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
    let (w, h) = rgb.dimensions();
    let pixels = rgb.as_raw().as_rgb();
    let encoded = ravif::Encoder::new()
        .with_quality(65.0)
        .with_speed(4)
        .encode_rgb(ravif::Img::new(pixels, w as usize, h as usize))
        .map_err(|e| anyhow!("avif encode failed: {e}"))?;

    let file_name = format!("{name_without_ext}.avif");
    let relative_url = format!("/uploads/{file_name}");
    super::storage::upload_avif(&relative_url, &encoded.avif_file).await?;
    Ok(relative_url)
}

pub async fn save_base64_image_as_avif(
    photo_base64: &str,
    name_without_ext: &str,
) -> Result<String> {
    if !photo_base64.starts_with("data:image/") {
        return Err(anyhow!("invalid image format"));
    }

    let img = load_image(photo_base64)?;
    let rgb = img.to_rgb8();
    let (w, h) = rgb.dimensions();
    let pixels = rgb.as_raw().as_rgb();
    let encoded = ravif::Encoder::new()
        .with_quality(65.0)
        .with_speed(4)
        .encode_rgb(ravif::Img::new(pixels, w as usize, h as usize))
        .map_err(|e| anyhow!("avif encode failed: {e}"))?;

    let file_name = format!("{name_without_ext}.avif");
    let relative_url = format!("/uploads/{file_name}");
    super::storage::upload_avif(&relative_url, &encoded.avif_file).await?;
    Ok(relative_url)
}
