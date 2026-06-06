-- user_id + platform 당 최신 토큰 1개만 유지
delete from device_token dt
where dt.id not in (
  select distinct on (user_id, platform) id
  from device_token
  order by user_id, platform, updated_at desc, id desc
);

alter table device_token
  drop constraint if exists device_token_user_id_platform_fcm_token_key;

alter table device_token
  add constraint uq_device_token_user_platform unique (user_id, platform);
