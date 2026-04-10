interface NewsArticleJsonLdProps {
  headline: string;
  description: string;
  datePublished: string;
  dateModified?: string;
  authorName: string;
  url: string;
  image?: string;
  publisherName?: string;
  publisherLogo?: string;
  keywords?: string[];
}

export function NewsArticleJsonLd({
  headline,
  description,
  datePublished,
  dateModified,
  authorName,
  url,
  image,
  publisherName = "AleCyberNews",
  publisherLogo = "/images/defaults/og-default.svg",
  keywords = [],
}: NewsArticleJsonLdProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline,
    description,
    datePublished,
    dateModified: dateModified ?? datePublished,
    author: {
      "@type": "Person",
      name: authorName,
    },
    publisher: {
      "@type": "Organization",
      name: publisherName,
      logo: {
        "@type": "ImageObject",
        url: publisherLogo,
      },
    },
    url,
    ...(image && {
      image: {
        "@type": "ImageObject",
        url: image,
        width: 1200,
        height: 630,
      },
    }),
    ...(keywords.length > 0 && { keywords: keywords.join(", ") }),
    inLanguage: url.includes("/zh/") ? "zh-Hans" : "en",
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
