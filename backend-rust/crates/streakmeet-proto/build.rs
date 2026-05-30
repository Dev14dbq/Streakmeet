fn main() -> Result<(), Box<dyn std::error::Error>> {
    let proto_root = "../../proto";
    tonic_build::configure()
        .build_server(true)
        .build_client(true)
        .compile_protos(
            &[
                format!("{proto_root}/streakmeet/v1/sync.proto"),
                format!("{proto_root}/streakmeet/v1/auth.proto"),
                format!("{proto_root}/streakmeet/v1/social.proto"),
                format!("{proto_root}/streakmeet/v1/streaks.proto"),
            ],
            &[proto_root],
        )?;
    Ok(())
}
