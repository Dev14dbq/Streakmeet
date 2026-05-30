# Multi-service Rust build. Pass SERVICE=api-gateway|sync-gateway|worker-service
FROM rust:1.83-bookworm AS builder
ARG SERVICE=api-gateway
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY proto ./proto
COPY services ./services
RUN cargo build --release -p ${SERVICE}

FROM debian:bookworm-slim
ARG SERVICE=api-gateway
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/${SERVICE} /usr/local/bin/service
ENV RUST_LOG=info
CMD ["service"]
