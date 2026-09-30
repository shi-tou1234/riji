export type SiteInfo = {
  /** 顶栏 + 首页大标题 */
  title: string;
  /** 顶栏下方小字标语 */
  slogan: string;
  /** 建站日期，用于首页统计「起于 ...」 */
  createdAt: string;
  /** 页脚署名 */
  author: string;
};

const siteInfo: SiteInfo = {
  title: 'AI 开发日记',
  slogan: '一个人，和一整支 AI 队伍',
  createdAt: '2026-09-30',
  author: 'cmchen',
};

export default siteInfo;
