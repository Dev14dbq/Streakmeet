//! Connect-compatible JSON server-streaming for browser clients.

use std::convert::Infallible;
use std::time::Duration;

use axum::{
    body::Body,
    extract::State,
    http::{header, HeaderMap, StatusCode},
    response::Response,
    Json,
};
use async_stream::stream;
use chrono::Utc;
use futures::StreamExt;
use prost_types::Timestamp;
use serde::Deserialize;
use streakmeet_auth::{config_from_env, verify_access_token};
use streakmeet_proto::{Heartbeat, SyncEnvelope};
use streakmeet_types::codes;
use tokio_stream::wrappers::IntervalStream;
use uuid::Uuid;

use crate::{catchup, AppState};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscribeRequestJson {
    pub last_event_id: Option<String>,
}

pub async fn connect_subscribe(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<SubscribeRequestJson>,
) -> Result<Response, (StatusCode, Json<serde_json::Value>)> {
    let user_id = extract_bearer_user_id(&headers)?;
    let last_event_id = body.last_event_id.unwrap_or_default();
    tracing::info!(user_id = %user_id, last_event_id = %last_event_id, "Connect Subscribe opened");

    let mut rx = state.hub.subscribe(&user_id);
    let pool = state.pool.clone();
    let nats = state.nats.clone();
    let user_for_catchup = user_id.clone();
    let devices = state.hub.subscriber_count(&user_id) + 1;
    tracing::debug!(user_id = %user_id, devices, "Subscribe stream opened (multi-device)");

    let event_stream = stream! {
        if let Ok(rows) = catchup::load_catchup(&pool, &nats, &user_for_catchup, &last_event_id).await {
            for envelope in rows {
                if let Some(line) = envelope_to_connect_line(&envelope) {
                    yield Ok::<_, Infallible>(line);
                }
            }
        }

        let heartbeat = IntervalStream::new(tokio::time::interval(Duration::from_secs(30)));
        tokio::pin!(heartbeat);

        loop {
            tokio::select! {
                msg = rx.recv() => {
                    match msg {
                        Ok(envelope) => {
                            if let Some(line) = envelope_to_connect_line(&envelope) {
                                yield Ok(line);
                            }
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                            tracing::warn!(skipped, user_id = %user_for_catchup, "sync stream lagged");
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                    }
                }
                _ = heartbeat.next() => {
                    let env = heartbeat_envelope();
                    if let Some(line) = envelope_to_connect_line(&env) {
                        yield Ok(line);
                    }
                }
            }
        }
    };

    let body = Body::from_stream(event_stream);
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/connect+json")
        .header("Connect-Protocol-Version", "1")
        .body(body)
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, codes::INTERNAL_ERROR))
}

pub async fn connect_catch_up(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<SubscribeRequestJson>,
) -> Result<Response, (StatusCode, Json<serde_json::Value>)> {
    let user_id = extract_bearer_user_id(&headers)?;
    let last_event_id = body.last_event_id.unwrap_or_default();
    tracing::info!(user_id = %user_id, last_event_id = %last_event_id, "Connect CatchUp");

    let pool = state.pool.clone();
    let nats = state.nats.clone();
    let stream = stream! {
        if let Ok(rows) = catchup::load_catchup(&pool, &nats, &user_id, &last_event_id).await {
            for envelope in rows {
                if let Some(line) = envelope_to_connect_line(&envelope) {
                    yield Ok::<_, Infallible>(line);
                }
            }
        }
    };

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/connect+json")
        .header("Connect-Protocol-Version", "1")
        .body(Body::from_stream(stream))
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, codes::INTERNAL_ERROR))
}

fn extract_bearer_user_id(headers: &HeaderMap) -> Result<String, (StatusCode, Json<serde_json::Value>)> {
    let auth = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| api_error(StatusCode::UNAUTHORIZED, codes::UNAUTHORIZED))?;

    let token = auth
        .strip_prefix("Bearer ")
        .ok_or_else(|| api_error(StatusCode::UNAUTHORIZED, codes::UNAUTHORIZED))?;

    let config = config_from_env();
    verify_access_token(token, &config.jwt_secret)
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, codes::INVALID_TOKEN))
}

fn api_error(status: StatusCode, code: &str) -> (StatusCode, Json<serde_json::Value>) {
    (
        status,
        Json(serde_json::json!({
            "code": code,
            "error": streakmeet_types::default_message(code),
        })),
    )
}

fn heartbeat_envelope() -> SyncEnvelope {
    SyncEnvelope {
        event_id: Uuid::new_v4().to_string(),
        sequence: 0,
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
    }
}

fn envelope_to_connect_line(envelope: &SyncEnvelope) -> Option<String> {
    let json = envelope_to_connect_json(envelope)?;
    Some(format!("{json}\n"))
}

pub fn envelope_to_connect_json(envelope: &SyncEnvelope) -> Option<String> {
    let mut root = serde_json::Map::new();
    root.insert("eventId".into(), envelope.event_id.clone().into());
    root.insert("sequence".into(), envelope.sequence.into());

    if let Some(at) = &envelope.at {
        root.insert(
            "at".into(),
            serde_json::json!({
                "seconds": at.seconds,
                "nanos": at.nanos,
            }),
        );
    }
    root.insert("actorId".into(), envelope.actor_id.clone().into());

    match &envelope.payload {
        Some(streakmeet_proto::streakmeet::v1::sync_envelope::Payload::FriendEvent(ev)) => {
            let friendship = ev.friendship.as_ref()?;
            let friend = friendship.friend.as_ref()?;
            root.insert(
                "friendEvent".into(),
                serde_json::json!({
                    "eventType": ev.event_type,
                    "friendship": {
                        "id": friendship.id,
                        "status": friendship.status,
                        "isIncomingRequest": friendship.is_incoming_request,
                        "friend": {
                            "id": friend.id,
                            "nickname": friend.nickname,
                            "avatarUrl": null_if_empty(&friend.avatar_url),
                        }
                    }
                }),
            );
        }
        Some(streakmeet_proto::streakmeet::v1::sync_envelope::Payload::StreakCreated(ev)) => {
            let streak = ev.streak.as_ref()?;
            let partner = streak.partner.as_ref()?;
            root.insert(
                "streakCreated".into(),
                serde_json::json!({
                    "streak": streak_list_item_json(streak, partner)
                }),
            );
        }
        Some(streakmeet_proto::streakmeet::v1::sync_envelope::Payload::StreakMeet(ev)) => {
            let partner = ev.partner.as_ref();
            root.insert(
                "streakMeet".into(),
                serde_json::json!({
                    "streakId": ev.streak_id,
                    "count": ev.count,
                    "lastMetDate": null_if_empty_str(&ev.last_met_date),
                    "partner": partner.map(|p| user_summary_json(p)),
                }),
            );
        }
        Some(streakmeet_proto::streakmeet::v1::sync_envelope::Payload::StreakBurned(ev)) => {
            root.insert(
                "streakBurned".into(),
                serde_json::json!({
                    "streakId": ev.streak_id,
                    "count": ev.count,
                }),
            );
        }
        Some(streakmeet_proto::streakmeet::v1::sync_envelope::Payload::Location(loc)) => {
            root.insert(
                "locationUpdated".into(),
                serde_json::json!({
                    "id": loc.user_id,
                    "nickname": loc.nickname,
                    "avatarUrl": null_if_empty(&loc.avatar_url),
                    "latitude": loc.lat,
                    "longitude": loc.lng,
                    "updatedAt": null_if_empty_str(&loc.updated_at),
                }),
            );
        }
        Some(streakmeet_proto::streakmeet::v1::sync_envelope::Payload::LocationRemoved(loc)) => {
            root.insert(
                "locationRemoved".into(),
                serde_json::json!({
                    "id": loc.user_id,
                    "removed": true,
                }),
            );
        }
        Some(streakmeet_proto::streakmeet::v1::sync_envelope::Payload::ProfileUpdated(p)) => {
            root.insert(
                "profileUpdated".into(),
                serde_json::json!({
                    "userId": p.user_id,
                    "nickname": p.nickname,
                    "avatarUrl": null_if_empty(&p.avatar_url),
                }),
            );
        }
        Some(streakmeet_proto::streakmeet::v1::sync_envelope::Payload::StreakPhotoAdded(p)) => {
            root.insert(
                "streakPhotoAdded".into(),
                serde_json::json!({
                    "streakId": p.streak_id,
                    "streakDayId": p.streak_day_id,
                    "photoUrl": p.photo_url,
                }),
            );
        }
        Some(streakmeet_proto::streakmeet::v1::sync_envelope::Payload::RemoteSelfiePending(p)) => {
            let pending = p.pending.as_ref();
            root.insert(
                "remoteSelfiePending".into(),
                serde_json::json!({
                    "streakId": p.streak_id,
                    "pendingRemoteSelfie": pending.map(|pi| serde_json::json!({
                        "id": pi.id,
                        "senderId": pi.sender_id,
                        "receiverId": pi.receiver_id,
                        "senderPhotoUrl": pi.sender_photo_url,
                        "needsReply": pi.needs_reply,
                        "senderNickname": pi.sender_nickname,
                    })),
                }),
            );
        }
        Some(streakmeet_proto::streakmeet::v1::sync_envelope::Payload::RemoteSelfieCleared(p)) => {
            let meet = p.meet.as_ref();
            root.insert(
                "remoteSelfieCleared".into(),
                serde_json::json!({
                    "streakId": p.streak_id,
                    "pendingRemoteSelfie": null,
                    "meet": meet.map(|m| serde_json::json!({
                        "streakId": m.streak_id,
                        "count": m.count,
                        "lastMetDate": null_if_empty_str(&m.last_met_date),
                        "partner": m.partner.as_ref().map(user_summary_json),
                    })),
                }),
            );
        }
        Some(streakmeet_proto::streakmeet::v1::sync_envelope::Payload::Notification(n)) => {
            root.insert(
                "notification".into(),
                serde_json::json!({
                    "type": n.r#type,
                    "params": n.params,
                    "route": null_if_empty_str(&n.route),
                }),
            );
        }
        Some(streakmeet_proto::streakmeet::v1::sync_envelope::Payload::Heartbeat(hb)) => {
            root.insert("heartbeat".into(), serde_json::json!({ "message": hb.message }));
        }
        _ => return None,
    }

    serde_json::to_string(&root).ok()
}

fn streak_list_item_json(
    streak: &streakmeet_proto::StreakListItem,
    partner: &streakmeet_proto::UserSummary,
) -> serde_json::Value {
    serde_json::json!({
        "id": streak.id,
        "count": streak.count,
        "lastMetDate": null_if_empty_str(&streak.last_met_date),
        "timezone": streak.timezone,
        "partner": user_summary_json(partner),
    })
}

fn user_summary_json(user: &streakmeet_proto::UserSummary) -> serde_json::Value {
    serde_json::json!({
        "id": user.id,
        "nickname": user.nickname,
        "avatarUrl": null_if_empty(&user.avatar_url),
    })
}

fn null_if_empty_str(value: &str) -> serde_json::Value {
    null_if_empty(value)
}

fn null_if_empty(value: &str) -> serde_json::Value {
    if value.is_empty() {
        serde_json::Value::Null
    } else {
        serde_json::Value::String(value.to_string())
    }
}

