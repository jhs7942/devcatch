export type FeedSource = {
    name: string;
    url: string;
};

// RSS를 제공하는 기술 뉴스 출처를 이 목록에서 관리한다.
export const feedSources: FeedSource[] = [
    {
      name: 'GitHub Blog',
      url: 'https://github.blog/feed/',
    },
    {
      name: 'Cloudflare Blog',
      url: 'https://blog.cloudflare.com/rss/',
    },
    {
      name: 'AWS News Blog',
      url: 'https://aws.amazon.com/blogs/aws/feed/',
    },
    {
      name: 'Kubernetes Blog',
      url: 'https://kubernetes.io/feed.xml',
    },
    {
      name: 'Google AI Blog',
      url: 'https://blog.google/technology/ai/rss/',
    },
  ];
