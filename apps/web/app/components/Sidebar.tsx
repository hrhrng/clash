'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  House,
  FolderOpen,
  GearSix,
  SignOut,
  SignIn,
  User,
} from '@phosphor-icons/react';
import betterAuthClient from '@/lib/betterAuthClient';

const navItems = [
  { name: 'Home', href: '/', icon: House },
  { name: 'Projects', href: '/projects', icon: FolderOpen },
];

export default function Sidebar() {
  const pathname = usePathname();
  const sessionQuery = betterAuthClient.useSession();
  const session = sessionQuery.data;
  const user = session?.user;

  const handleSignOut = async () => {
    try {
      await betterAuthClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            window.location.href = '/';
          },
        },
      });
    } catch (error) {
      console.error('Sign out error:', error);
      window.location.href = '/';
    }
  };

  const handleSignIn = async () => {
    try {
      await betterAuthClient.signIn.social({
        provider: 'google',
        callbackURL: '/',
      });
    } catch (error) {
      console.error('Sign in error:', error);
    }
  };

  // Get user initials for avatar
  const getInitials = (name: string | null | undefined) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <aside className="fixed top-0 left-0 flex h-screen w-72 flex-col border-r border-slate-200 bg-slate-50">
      {/* Logo Section */}
      <div className="px-6 py-8">
        <Link href="/" className="group inline-block">
          <motion.div
            className="flex items-center"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <span className="font-display text-4xl font-bold tracking-tighter text-gray-900 group-hover:text-brand transition-colors">
              C/
            </span>
          </motion.div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-2 px-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link key={item.name} href={item.href}>
              <motion.div
                className={`flex items-center gap-4 rounded-2xl px-5 py-3.5 text-base font-medium transition-all ${
                  isActive
                    ? 'bg-gray-900 text-white shadow-md'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
              >
                <Icon className={`h-6 w-6 ${isActive ? 'text-brand' : ''}`} weight={isActive ? "fill" : "regular"} />
                <span>{item.name}</span>
              </motion.div>
            </Link>
          );
        })}
      </nav>

      {/* Bottom Section */}
      <div className="space-y-2 p-4 pb-8">
        {/* Settings */}
        <motion.button
          className="flex w-full items-center gap-4 rounded-2xl px-5 py-3.5 text-base font-medium text-gray-600 transition-all hover:bg-gray-100 hover:text-gray-900"
          whileHover={{ x: 4 }}
          whileTap={{ scale: 0.98 }}
        >
          <GearSix className="h-6 w-6" weight="regular" />
          <span>Settings</span>
        </motion.button>

        {/* User Profile / Sign In */}
        {user ? (
          <motion.div
            className="flex cursor-pointer items-center gap-3 rounded-lg bg-gray-100 px-4 py-2.5 transition-all hover:bg-gray-200"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {user.image ? (
              <img
                src={user.image}
                alt="Avatar"
                className="h-8 w-8 rounded-md object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-cyan-400 to-blue-500 text-xs font-bold text-white">
                {getInitials(user.name)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-gray-900">
                {user.name || 'User'}
              </p>
              <p className="truncate text-xs text-gray-500">{user.email}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="rounded-md p-1 hover:bg-gray-300 transition-colors"
              title="Sign Out"
            >
              <SignOut className="h-4 w-4 text-gray-400 hover:text-red-500" weight="bold" />
            </button>
          </motion.div>
        ) : (
          <motion.button
            onClick={handleSignIn}
            className="flex w-full items-center gap-3 rounded-lg bg-blue-500 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-blue-600"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <SignIn className="h-5 w-5" weight="bold" />
            <span>Sign In with Google</span>
          </motion.button>
        )}
      </div>
    </aside>
  );
}


