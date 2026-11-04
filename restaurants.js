// 오프라인/미연결 시 기본 목록입니다. Supabase 시드는 supabase/schema.sql 을 사용하세요.
// id는 음식점마다 서로 다른 고정값을 사용하세요.
export const DEFAULT_CATEGORIES = [
  '중식', '햄버거', '한식', '초밥', '순대국', '돈까츠', '라멘', '건강식', '샌드위치',
];

export const DEFAULT_RESTAURANTS = [
  { id: 'pho', name: '쌀국수', categories: ['중식'] },
  { id: 'vietnam-nosang', name: '베트남노상식당 연남본점', categories: ['중식'] },
  { id: 'ssepiri', name: '쎕이리', categories: ['중식'] },
  { id: 'dongboseong', name: '동보성', categories: ['중식'] },
  { id: 'dongpayuk1080', name: '동파육1080', categories: ['중식'] },
  { id: 'seodamheon', name: '서담헌', categories: ['중식'] },
  { id: 'wakburger', name: '왁버거', categories: ['햄버거'] },
  { id: 'popeyes', name: '파파이스', categories: ['햄버거'] },
  { id: 'momstouch', name: '맘스터치', categories: ['햄버거'] },
  { id: 'chibeok', name: '치벅', categories: ['햄버거'] },
  { id: 'korea', name: '코리아', categories: ['한식'] },
  { id: 'ongsimi', name: '옹시미', categories: ['한식'] },
  { id: 'seogyodong-yeentan', name: '서교동 연탄집', categories: ['한식'] },
  { id: 'sampyeong', name: '삼평식당', categories: ['한식'] },
  { id: 'hansang', name: '한상', categories: ['한식'] },
  { id: 'sushi-enjun', name: '스시엔준', categories: ['초밥'] },
  { id: 'olbareun-sushi', name: '올바른스시', categories: ['초밥'] },
  { id: 'boseung', name: '보승회관', categories: ['순대국'] },
  { id: 'ginzaryoko', name: '긴자료코', categories: ['돈까츠'] },
  { id: 'myeongdong-donkatsu', name: '명동왕돈까스', categories: ['돈까츠'] },
  { id: 'katsuup', name: '카츠업', categories: ['돈까츠'] },
  { id: 'myeonsikdang', name: '면식당 홍익대점', categories: ['라멘'] },
  { id: 'ninnin', name: '닌닌라멘', categories: ['라멘'] },
  { id: 'mumei', name: '라멘 무메이', categories: ['라멘'] },
  { id: 'hiruma', name: '히루마', categories: ['라멘'] },
  { id: 'mr-ramen', name: '미스터라멘 서교점', categories: ['라멘'] },
  { id: 'mennoaji', name: '멘노아지 홍대점', categories: ['라멘'] },
  { id: 'proteiner', name: '프로티너', categories: ['건강식'] },
  { id: 'preppers', name: '프레퍼스', categories: ['건강식'] },
  { id: 'subway', name: '서브웨이', categories: ['샌드위치'] },
];
