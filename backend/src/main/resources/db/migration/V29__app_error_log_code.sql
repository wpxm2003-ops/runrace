alter table app_error_log add column error_code varchar(100);

create index idx_app_error_log_code
    on app_error_log (error_code, created_at desc)
    where error_code is not null;
