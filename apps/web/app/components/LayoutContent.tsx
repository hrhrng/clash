'use client';

import { usePathname } from 'next/navigation';
import TopNavigation from './TopNavigation';

export default function LayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // 检查是否是项目详情页面
  const isProjectDetailPage = pathname?.match(/^\/projects\/[^\/]+$/);

  if (isProjectDetailPage) {
    // 项目详情页面：全屏，无sidebar/navigation
    return <>{children}</>;
  }

  // 其他页面：显示TopNavigation
  return (
    <>
      <TopNavigation />
      <main className="pt-24 min-h-screen bg-white">{children}</main>
    </>
  );
}
