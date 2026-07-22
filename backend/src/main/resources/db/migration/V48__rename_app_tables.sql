-- app_user/app_error_log의 "app_" 접두어 제거. user는 예약어라 users(복수형)로.
alter table app_user rename to users;
alter table app_error_log rename to error_log;
