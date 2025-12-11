'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  House,
  FolderOpen,
  GearSix,
  SignOut,
} from '@phosphor-icons/react';

const navItems = [
  { name: 'Home', href: '/', icon: House },
  { name: 'Projects', href: '/projects', icon: FolderOpen },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed top-0 left-0 flex h-screen w-72 flex-col border-r border-slate-200 bg-slate-50">
      {/* Logo Section */}
      <div className="border-b border-slate-200 px-4 py-6">
        <Link href="/" className="group">
          <motion.div
            className="flex items-center px-4"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <span className="font-display font-medium text-3xl tracking-tight text-slate-900">
              Clash
            </span>
          </motion.div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1.5 overflow-y-auto p-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link key={item.name} href={item.href}>
              <motion.div
                className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-red-50 text-red-600'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
              >
                <Icon className="h-5 w-5" weight="duotone" />
                <span>{item.name}</span>
              </motion.div>
            </Link>
          );
        })}
      </nav>

      {/* Bottom Section */}
      <div className="space-y-1.5 border-t border-slate-200 p-4">
        {/* Settings */}
        <motion.button
          className="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-100"
          whileHover={{ x: 2 }}
          whileTap={{ scale: 0.98 }}
        >
          <GearSix className="h-5 w-5" weight="duotone" />
          <span>Settings</span>
        </motion.button>

        {/* User Profile */}
        <motion.div
          className="flex cursor-pointer items-center gap-3 rounded-lg bg-gray-100 px-4 py-2.5 transition-all hover:bg-gray-200"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-cyan-400 to-blue-500 text-xs font-bold text-white">
            蛇
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-gray-900">蛇皮</p>
            <p className="truncate text-xs text-gray-500">xiaoyang@clash.dev</p>
          </div>
          <SignOut className="h-4 w-4 text-gray-400" weight="bold" />
        </motion.div>
      </div>
    </aside>
  );
}
