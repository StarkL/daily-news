import type { Props } from "astro";
import IconMail from "@/assets/icons/IconMail.svg";
import IconGitHub from "@/assets/icons/IconGitHub.svg";
import IconBrandX from "@/assets/icons/IconBrandX.svg";
import IconLinkedin from "@/assets/icons/IconLinkedin.svg";
import IconWhatsapp from "@/assets/icons/IconWhatsapp.svg";
import IconFacebook from "@/assets/icons/IconFacebook.svg";
import IconTelegram from "@/assets/icons/IconTelegram.svg";
import IconPinterest from "@/assets/icons/IconPinterest.svg";
import { SITE } from "@/config";

interface Social {
  name: string;
  href: string;
  linkTitle: string;
  icon: (_props: Props) => Element;
}

export const SOCIALS: Social[] = [
  {
    name: "GitHub",
    href: "https://github.com/satnaing/astro-paper",
    linkTitle: `${SITE.title} on GitHub`,
    icon: IconGitHub,
  },
  {
    name: "X",
    href: "https://x.com/username",
    linkTitle: `${SITE.title} on X`,
    icon: IconBrandX,
  },
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/in/username/",
    linkTitle: `${SITE.title} on LinkedIn`,
    icon: IconLinkedin,
  },
  {
    name: "Mail",
    href: "mailto:yourmail@gmail.com",
    linkTitle: `Send an email to ${SITE.title}`,
    icon: IconMail,
  },
] as const;

export const SHARE_LINKS: Social[] = [
  {
    name: "WhatsApp",
    href: "https://wa.me/?text=",
    linkTitle: `Share this post via WhatsApp`,
    icon: IconWhatsapp,
  },
  {
    name: "Facebook",
    href: "https://www.facebook.com/sharer.php?u=",
    linkTitle: `Share this post on Facebook`,
    icon: IconFacebook,
  },
  {
    name: "X",
    href: "https://x.com/intent/post?url=",
    linkTitle: `Share this post on X`,
    icon: IconBrandX,
  },
  {
    name: "Telegram",
    href: "https://t.me/share/url?url=",
    linkTitle: `Share this post via Telegram`,
    icon: IconTelegram,
  },
  {
    name: "Pinterest",
    href: "https://pinterest.com/pin/create/button/?url=",
    linkTitle: `Share this post on Pinterest`,
    icon: IconPinterest,
  },
  {
    name: "Mail",
    href: "mailto:?subject=See%20this%20post&body=",
    linkTitle: `通过邮件分享此文章`,
    icon: IconMail,
  },
] as const;

/* ========== UI Labels ========== */

export const NAV_LABELS = {
  posts: "文章",
  tags: "标签",
  about: "关于",
  archives: "归档",
  search: "搜索",
  home: "首页",
  featured: "精选",
  recentPosts: "最新文章",
  allPosts: "全部文章",
  readMore: "阅读全文",
} as const;

export const BUTTON_LABELS = {
  skipToContent: "跳到正文",
  goBack: "返回",
  goBackHome: "返回首页",
  openMenu: "打开菜单",
  closeMenu: "关闭菜单",
  toggleTheme: "切换浅色/深色模式",
  copy: "复制",
  copied: "已复制",
} as const;

export const PAGE_LABELS = {
  notFound: "页面未找到",
  search: "搜索",
  searchDesc: "搜索文章...",
  archives: "归档",
  archivesDesc: "所有文章归档",
  tags: "标签",
  tagsDesc: "所有文章使用的标签",
  previousPost: "上一篇",
  nextPost: "下一篇",
  home: "首页",
  postsPage: (n: number) => `文章（第 ${n} 页）`,
  tagPage: (tag: string, n: number) =>
    `${tag} ${n === 1 ? "" : `（第 ${n} 页）`}`,
} as const;

export const FOOTER_LABELS = {
  copyright: "版权所有",
} as const;

export const DEV_LABELS = {
  searchWarning: "开发模式提示",
  searchWarningDesc: "需要至少执行一次构建才能看到搜索结果",
  devBuildCmd: "pnpm run build",
} as const;

export const MONTH_NAMES = [
  "1月",
  "2月",
  "3月",
  "4月",
  "5月",
  "6月",
  "7月",
  "8月",
  "9月",
  "10月",
  "11月",
  "12月",
] as const;
