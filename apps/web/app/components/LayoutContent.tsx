'use client';

import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';

export default function LayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // 检查是否是项目详情页面
  const isProjectDetailPage = pathname?.match(/^\/projects\/[^\/]+$/);

  if (isProjectDetailPage) {
    // 项目详情页面：全屏，无sidebar
    return <>{children}</>;
  }

  // 其他页面：显示sidebar
  return (
    <>
      <Sidebar />
      <main className="ml-72">{children}</main>
    </>
  );
}
