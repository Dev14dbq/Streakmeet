use axum::{
    body::Body,
    http::{header, StatusCode},
    response::Response,
};

pub async fn serve_upload_handler(
    axum::extract::Path(filename): axum::extract::Path<String>,
) -> Result<Response, StatusCode> {
    if filename.is_empty() || filename.contains("..") {
        return Err(StatusCode::BAD_REQUEST);
    }

    let relative_url = format!("/uploads/{filename}");
    if !streakmeet_media::is_media_url(&relative_url) {
        return Err(StatusCode::BAD_REQUEST);
    }

    let object = streakmeet_media::get_object_bytes(&relative_url)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let Some(object) = object else {
        return Err(StatusCode::NOT_FOUND);
    };

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "image/avif")
        .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
        .header(header::CONTENT_LENGTH, object.content_length.to_string())
        .body(Body::from(object.bytes))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
