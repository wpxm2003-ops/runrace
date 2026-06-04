export type Locale = "ko" | "en";

export const translations = {
  ko: {
    // ── 공통 ──────────────────────────────
    loading: "로딩 중...",
    saving: "저장 중...",
    deleting: "삭제 중...",
    save: "저장",
    delete: "삭제",
    cancel: "취소",
    confirm: "확인",
    error_occurred: "문제가 발생했어요",
    error_retry: "잠시 후 다시 시도해 주세요. 문제가 계속되면 새로고침해 주세요.",
    refresh: "새로고침",
    no_name: "(이름 없음)",

    // ── 헤더 / 네비 ───────────────────────
    nav_home: "홈",
    nav_races: "대결",
    nav_friends: "친구",
    nav_workout: "운동",
    nav_profile: "내정보",
    nav_main_menu: "주요 메뉴",
    header_logout: "로그아웃",
    header_login: "로그인",

    // ── 홈 ────────────────────────────────
    home_tagline: "로그인 후 친구를 초대하고 달리기 대결을 시작해보세요.",
    home_login: "로그인",
    home_login_desc: "Google / Apple 로그인",
    home_friends: "친구",
    home_friends_desc: "초대 링크 생성 · 친구 목록",
    home_races: "대결",
    home_races_desc: "50km 대결 생성 / 순위 보기",
    home_workout: "운동하기",
    home_workout_desc: "GPS로 실시간 경로 기록",
    home_fitness: "오늘 거리 동기화",
    home_fitness_desc: "헬스 합산 거리 업로드 (대결 반영)",
    home_next: "다음 단계",
    home_next_desc: "친구 초대 → 대결 생성 → 거리 동기화",

    // ── 로그인 ────────────────────────────
    login_headline: "RunRace",
    login_desc: "로그인 후 친구를 초대하고 50km 대결을 만들어 경쟁해보세요.",
    login_google: "Google 로그인",
    login_apple: "Apple 로그인",
    login_busy: "로그인 중...",
    login_apple_note: "Apple 로그인은 Firebase 콘솔에서 Apple provider 설정이 필요합니다.",
    login_popup_blocked: "로그인 창이 차단되었습니다. Chrome 설정에서 팝업 허용 후 다시 시도해 주세요.",

    // ── 대결 목록 ─────────────────────────
    races_title: "대결",
    races_create_btn: "방만들기",
    races_list_heading: "대결 목록",
    races_empty: "대결이 없습니다. 방만들기로 새 대결을 시작해 보세요.",
    races_goal_members: (goalKm: number, memberCount: number) =>
      `목표 ${goalKm}km · ${memberCount}명 참여`,

    // ── 대결 만들기 ───────────────────────
    create_title: "방 만들기",
    create_list_link: "목록",
    create_limit_warning: (maxActive: number, activeCount: number) =>
      `종료되지 않은 방은 최대 ${maxActive}개까지 만들 수 있습니다. (현재 ${activeCount}개)`,
    create_field_title: "제목",
    create_field_title_placeholder: "예: 6월 러닝 대결",
    create_field_goal: "목표 km",
    create_field_goal_placeholder: "정수만 입력",
    create_field_members: "인원수 (최대 50명)",
    create_field_start: "시작일",
    create_field_end: "종료일",
    create_btn: "방 생성",
    create_btn_busy: "생성 중...",
    create_required: "*",

    // ── 대결 상세 ─────────────────────────
    detail_title: "대결 상세",
    detail_no_id: "대결 ID가 없습니다.",
    detail_link_copied: "링크가 복사되었습니다.",
    detail_menu_label: "메뉴",
    detail_edit: "수정",
    detail_delete: "삭제",
    detail_invite: "초대",
    detail_share: "공유하기",
    detail_list_link: "목록",
    detail_delete_title: "방 삭제",
    detail_delete_message: "이 대결 방을 삭제할까요? 삭제 후에는 복구할 수 없습니다.",
    detail_progress: "진행 현황",
    detail_winner_label: "Winner",
    detail_winner_message: (name: string) => `${name}님, 축하합니다!`,
    detail_join: "참여하기",
    detail_joining: "참여 중...",

    // ── 대결 수정 ─────────────────────────
    edit_title: "방 수정",
    edit_detail_link: "상세",
    edit_field_title: "제목",
    edit_field_goal: "목표 km",
    edit_field_members: "인원수 (최대 50명)",
    edit_field_start: "시작일",
    edit_field_end: "종료일",
    edit_err_title: "제목을 입력하세요.",
    edit_err_goal: "목표 km는 1 이상 정수로 입력하세요.",
    edit_err_members: (min: number) => `인원수는 참여 ${min}명 이상, 50명 이하여야 합니다.`,
    edit_err_date: "종료일은 시작일 이후여야 합니다.",

    // ── 친구 ──────────────────────────────
    friends_title: "친구",
    friends_invite_heading: "친구 초대",
    friends_invite_desc: "초대 링크를 만들어 친구에게 공유하세요.",
    friends_invite_btn: "초대 링크 생성",
    friends_invite_link_label: "초대 링크",
    friends_list_heading: "친구 목록",
    friends_empty: "아직 친구가 없습니다.",

    // ── 친구 초대 수락 ────────────────────
    accept_title: "친구 초대 수락",
    accept_code_label: "코드:",
    accept_code_none: "(없음)",
    accept_idle: "대기 중...",
    accept_accepting: "수락 처리 중...",
    accept_done: "수락 완료! 이제 친구 목록에서 확인하세요.",
    accept_error: (msg: string) => `실패: ${msg}`,
    accept_go_friends: "친구로 이동",

    // ── 거리 동기화 ───────────────────────
    fitness_title: "오늘 거리 동기화",
    fitness_desc: 'MVP에서는 헬스 SDK 연동 전이라, "오늘 합산 거리"를 직접 입력해 업로드하는 형태로 연결해둡니다.',
    fitness_date: "날짜",
    fitness_source: "소스",
    fitness_distance: "거리 (km)",
    fitness_upload: "업로드",

    // ── 내 정보 ───────────────────────────
    my_title: "내정보",
    my_account_label: "로그인 계정",
    my_logout: "로그아웃",
    my_records_heading: "운동 기록",
    my_records_loading: "불러오는 중...",
    my_records_empty: "아직 저장된 운동 기록이 없습니다.",

    // ── 운동하기 ──────────────────────────
    workout_title: "운동하기",
    workout_subtitle: "이동 경로가 지도에 실시간으로 표시됩니다.",
    workout_map_loading: "지도 불러오는 중...",
    workout_locating: "위치 확인 중...",
    workout_no_route: "저장할 운동 경로가 없습니다.",

    // ── 운동 스탯 그리드 ──────────────────
    stat_time: "시간",
    stat_distance: "거리",
    stat_calories: "칼로리",
    stat_pace: "페이스",
    workout_start: "운동 시작",
    workout_pause: "일시정지",
    workout_resume: "재개",
    workout_stop: "종료",
    workout_stop_saving: "저장 중...",

    // ── 운동 완료 ─────────────────────────
    celebration_title: "운동 완료!",
    celebration_messages: [
      "고생 많았어요! 오늘도 정말 잘 해냈어요!",
      "멋진 운동이었어요! 수고하셨습니다!",
      "끝까지 해냈어요! 당신 최고예요!",
      "오늘의 노력, 분명히 쌓이고 있어요!",
      "완주! 이 기세로 계속 가봐요!",
    ],
    celebration_saving: "기록 저장 중...",
    celebration_confirm: "확인",
    celebration_auto: (sec: number) => `${sec}초 후 마이페이지로 이동합니다`,
    celebration_calories: (kcal: number) => `${kcal} kcal 소모 (추정)`,

    // ── 운동 상세 ─────────────────────────
    workout_detail_title: "운동 기록",
    workout_delete_btn: "삭제하기",
    workout_deleting_btn: "삭제 중...",
    workout_delete_title: "기록 삭제",
    workout_delete_message: "이 운동 기록을 삭제할까요? 삭제 후에는 복구할 수 없습니다.",
    workout_start_label: "시작:",
    workout_end_label: "종료:",
  },

  en: {
    // ── 공통 ──────────────────────────────
    loading: "Loading...",
    saving: "Saving...",
    deleting: "Deleting...",
    save: "Save",
    delete: "Delete",
    cancel: "Cancel",
    confirm: "OK",
    error_occurred: "Something went wrong",
    error_retry: "Please try again. If the issue persists, refresh the page.",
    refresh: "Refresh",
    no_name: "(No name)",

    // ── 헤더 / 네비 ───────────────────────
    nav_home: "Home",
    nav_races: "Races",
    nav_friends: "Friends",
    nav_workout: "Run",
    nav_profile: "Profile",
    nav_main_menu: "Main menu",
    header_logout: "Sign out",
    header_login: "Sign in",

    // ── 홈 ────────────────────────────────
    home_tagline: "Sign in, invite friends, and race to 50km.",
    home_login: "Sign in",
    home_login_desc: "Google · Apple",
    home_friends: "Friends",
    home_friends_desc: "Invite · Friend list",
    home_races: "Races",
    home_races_desc: "Create a race · Leaderboard",
    home_workout: "Run",
    home_workout_desc: "Track your route with GPS",
    home_fitness: "Sync Distance",
    home_fitness_desc: "Upload daily distance from health apps",
    home_next: "Get started",
    home_next_desc: "Invite friends → Create race → Sync distance",

    // ── 로그인 ────────────────────────────
    login_headline: "RunRace",
    login_desc: "Sign in, invite friends, and compete in a 50km running race.",
    login_google: "Continue with Google",
    login_apple: "Continue with Apple",
    login_busy: "Signing in...",
    login_apple_note: "Apple sign-in requires Apple provider setup in Firebase Console.",
    login_popup_blocked: "Popup was blocked. Allow popups in Chrome settings and try again.",

    // ── 대결 목록 ─────────────────────────
    races_title: "Races",
    races_create_btn: "New Race",
    races_list_heading: "Race List",
    races_empty: "No races yet. Create one to get started!",
    races_goal_members: (goalKm: number, memberCount: number) =>
      `${goalKm}km goal · ${memberCount} joined`,

    // ── 대결 만들기 ───────────────────────
    create_title: "New Race",
    create_list_link: "All Races",
    create_limit_warning: (maxActive: number, activeCount: number) =>
      `You can have up to ${maxActive} active races. (${activeCount} active)`,
    create_field_title: "Title",
    create_field_title_placeholder: "e.g. June Running Race",
    create_field_goal: "Goal (km)",
    create_field_goal_placeholder: "Whole number",
    create_field_members: "Max members (up to 50)",
    create_field_start: "Start date",
    create_field_end: "End date",
    create_btn: "Create Race",
    create_btn_busy: "Creating...",
    create_required: "*",

    // ── 대결 상세 ─────────────────────────
    detail_title: "Race Details",
    detail_no_id: "Race not found.",
    detail_link_copied: "Link copied!",
    detail_menu_label: "Menu",
    detail_edit: "Edit",
    detail_delete: "Delete",
    detail_invite: "Invite",
    detail_share: "Share",
    detail_list_link: "All Races",
    detail_delete_title: "Delete Race",
    detail_delete_message: "Delete this race? This cannot be undone.",
    detail_progress: "Progress",
    detail_winner_label: "Winner",
    detail_winner_message: (name: string) => `🏆 ${name} wins!`,
    detail_join: "Join Race",
    detail_joining: "Joining...",

    // ── 대결 수정 ─────────────────────────
    edit_title: "Edit Race",
    edit_detail_link: "Details",
    edit_field_title: "Title",
    edit_field_goal: "Goal (km)",
    edit_field_members: "Max members (up to 50)",
    edit_field_start: "Start date",
    edit_field_end: "End date",
    edit_err_title: "Please enter a title.",
    edit_err_goal: "Goal must be a whole number (1 or more).",
    edit_err_members: (min: number) => `Members must be between ${min} and 50.`,
    edit_err_date: "End date must be after start date.",

    // ── 친구 ──────────────────────────────
    friends_title: "Friends",
    friends_invite_heading: "Invite a Friend",
    friends_invite_desc: "Share an invite link to connect with friends.",
    friends_invite_btn: "Generate invite link",
    friends_invite_link_label: "Invite link",
    friends_list_heading: "Friends",
    friends_empty: "No friends yet.",

    // ── 친구 초대 수락 ────────────────────
    accept_title: "Accept Invitation",
    accept_code_label: "Code:",
    accept_code_none: "(none)",
    accept_idle: "Waiting...",
    accept_accepting: "Accepting...",
    accept_done: "You're now friends! Check your friends list.",
    accept_error: (msg: string) => `Failed: ${msg}`,
    accept_go_friends: "Go to Friends",

    // ── 거리 동기화 ───────────────────────
    fitness_title: "Sync Distance",
    fitness_desc: "Before health SDK integration, enter and upload your total daily distance manually.",
    fitness_date: "Date",
    fitness_source: "Source",
    fitness_distance: "Distance (km)",
    fitness_upload: "Upload",

    // ── 내 정보 ───────────────────────────
    my_title: "Profile",
    my_account_label: "Signed in as",
    my_logout: "Sign out",
    my_records_heading: "Workouts",
    my_records_loading: "Loading...",
    my_records_empty: "No workouts saved yet.",

    // ── 운동하기 ──────────────────────────
    workout_title: "Run",
    workout_subtitle: "Your route is tracked on the map in real time.",
    workout_map_loading: "Loading map...",
    workout_locating: "Finding location...",
    workout_no_route: "No route to save.",

    // ── 운동 스탯 그리드 ──────────────────
    stat_time: "Time",
    stat_distance: "Distance",
    stat_calories: "Calories",
    stat_pace: "Pace",
    workout_start: "Start",
    workout_pause: "Pause",
    workout_resume: "Resume",
    workout_stop: "Finish",
    workout_stop_saving: "Saving...",

    // ── 운동 완료 ─────────────────────────
    celebration_title: "Workout Done!",
    celebration_messages: [
      "Great effort! You crushed it today!",
      "Awesome run! Well done!",
      "You made it to the end — you're amazing!",
      "Every step counts. Keep it up!",
      "Finished strong! Ride that momentum!",
    ],
    celebration_saving: "Saving your record...",
    celebration_confirm: "View Record",
    celebration_auto: (sec: number) => `Going to your profile in ${sec}s`,
    celebration_calories: (kcal: number) => `~${kcal} kcal burned`,

    // ── 운동 상세 ─────────────────────────
    workout_detail_title: "Workout",
    workout_delete_btn: "Delete",
    workout_deleting_btn: "Deleting...",
    workout_delete_title: "Delete Workout",
    workout_delete_message: "Delete this workout? This cannot be undone.",
    workout_start_label: "Start:",
    workout_end_label: "End:",
  },
} satisfies Record<Locale, Record<string, unknown>>;

export type TranslationKey = keyof (typeof translations)["ko"];
export type Translations = (typeof translations)["ko"];
