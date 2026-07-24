-- 앱푸시동의(push_enabled) 기본값을 false로 — 알림을 허용해 '첫' 디바이스 토큰이 등록되는 시점에
-- true로 전환된다(DeviceTokenService). 이전 기본값 true는 웹/미허용 유저까지 켜진 것으로 보여
-- 실제 푸시 수신 가능 여부와 어긋났다(토큰 없으면 발송 0건).
alter table users alter column push_enabled set default false;

-- 기존 데이터 정합화: 디바이스 토큰이 하나도 없는 유저는 실제 수신이 불가하므로 false로 맞춘다.
-- 전송 동작은 불변 — PushService는 토큰이 없으면 어차피 0건 발송이라 순수 데이터 정합성 목적.
-- 토큰이 있는 유저는 건드리지 않는다: 명시적으로 끈(opt-out=false) 사람도 그대로 유지된다.
update users u
   set push_enabled = false
 where u.push_enabled = true
   and not exists (select 1 from device_token d where d.user_id = u.id);

comment on column users.push_enabled is
  '푸시 수신 선호. 기본 false. 알림 허용해 첫 디바이스 토큰이 등록되면 true로 전환, 내정보 토글로 변경.';
