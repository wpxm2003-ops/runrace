alter table crew add column image_urls text;

update crew
set image_urls = json_build_array(image_url)::text
where image_url is not null and image_urls is null;

comment on column crew.image_urls is '공개 크루 이미지 URL JSON 배열(최대 4장). image_url은 첫 장 썸네일/호환용.';
