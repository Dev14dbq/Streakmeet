use std::pin::Pin;
use std::time::Duration;

use chrono::Utc;
use prost_types::Timestamp;
use streakmeet_proto::{
    sync_service_server::SyncService, AckRequest, AckResponse, CatchUpRequest, Heartbeat,
    SubscribeRequest, SyncEnvelope,
};
use tokio::time;
use tokio_stream::{wrappers::IntervalStream, Stream, StreamExt};
use tonic::{Request, Response, Status};
use uuid::Uuid;

pub struct SyncGateway;

type SyncStream = Pin<Box<dyn Stream<Item = Result<SyncEnvelope, Status>> + Send>>;

#[tonic::async_trait]
impl SyncService for SyncGateway {
    type SubscribeStream = SyncStream;
    type CatchUpStream = SyncStream;

    async fn subscribe(
        &self,
        request: Request<SubscribeRequest>,
    ) -> Result<Response<Self::SubscribeStream>, Status> {
        let last = request.into_inner().last_event_id;
        tracing::info!(last_event_id = %last, "Subscribe stream opened");
        Ok(Response::new(Box::pin(heartbeat_stream())))
    }

    async fn catch_up(
        &self,
        request: Request<CatchUpRequest>,
    ) -> Result<Response<Self::CatchUpStream>, Status> {
        let last = request.into_inner().last_event_id;
        tracing::info!(last_event_id = %last, "CatchUp stream opened (stub)");
        Ok(Response::new(Box::pin(heartbeat_stream())))
    }

    async fn ack(&self, request: Request<AckRequest>) -> Result<Response<AckResponse>, Status> {
        tracing::debug!(event_id = %request.into_inner().event_id, "Ack received");
        Ok(Response::new(AckResponse { ok: true }))
    }
}

fn heartbeat_stream() -> impl Stream<Item = Result<SyncEnvelope, Status>> + Send {
    let mut sequence: i64 = 0;
    IntervalStream::new(time::interval(Duration::from_secs(30))).map(move |_| {
        sequence += 1;
        Ok(SyncEnvelope {
            event_id: Uuid::new_v4().to_string(),
            sequence,
            at: Some(Timestamp {
                seconds: Utc::now().timestamp(),
                nanos: 0,
            }),
            actor_id: "system".into(),
            payload: Some(
                streakmeet_proto::streakmeet::v1::sync_envelope::Payload::Heartbeat(Heartbeat {
                    message: "ping".into(),
                }),
            ),
        })
    })
}
