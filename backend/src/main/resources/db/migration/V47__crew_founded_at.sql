alter table crew add column founded_at date;

comment on column crew.founded_at is '실제 크루 창설일(선택, 리더 입력). null이면 상세 화면에 created_at을 대신 표시한다.';
