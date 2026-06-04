alter table app_user add column if not exists nickname varchar(50);
update app_user set nickname = display_name where nickname is null;
alter table app_user add constraint uq_nickname unique (nickname);
