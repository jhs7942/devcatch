export type FeedSource = {
    name: string;
    url: string;
};

// RSS를 제공하는 기술 뉴스 출처를 이 목록에서 관리한다.
export const feedSources: FeedSource[] = [
    {
      name: 'NAVER D2',
      url: 'https://d2.naver.com/d2.atom',
    },
    {
      name: '카카오테크',
      url: 'https://tech.kakao.com/feed/',
    },
    {
      name: '우아한형제들 기술블로그',
      url: 'https://techblog.woowahan.com/feed/',
    },
    {
      name: '토스 기술 블로그',
      url: 'https://toss.tech/rss.xml',
    },
  ];
