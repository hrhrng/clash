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
} from '@phosphor-icons/react';
import betterAuthClient from '@/lib/betterAuthClient';

const navItems = [
  { name: 'Home', href: '/', icon: House },
  { name: 'Projects', href: '/projects', icon: FolderOpen },
  { name: 'Prompt Library', href: '/prompts', icon: File },
];

export default function TopNavigation() {
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
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-6 pointer-events-none">
      {/* Logo Area */}
      <div className="pointer-events-auto">
        <Link href="/" className="group">
          <motion.div
            className="flex items-center gap-2"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
             <span className="font-display text-2xl font-bold tracking-tighter text-gray-900 group-hover:text-brand transition-colors">
              C/
            </span>
          </motion.div>
        </Link>
      </div>

      {/* Floating Center Nav - The "Rounded Rectangle" */}
      <nav className="pointer-events-auto shadow-sm border border-slate-200 bg-white/80 backdrop-blur-xl rounded-full px-2 py-1.5 flex items-center gap-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          // Prompt Library is just a placeholder to match the screenshot provided by user description roughly
          if (item.name === 'Prompt Library') return null;

          return (
            <Link key={item.name} href={item.href}>
              <motion.div
                className={`relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  isActive
                    ? 'text-gray-900'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100/50'
                }`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-pill"
                    className="absolute inset-0 bg-gray-100 rounded-full"
                    style={{ borderRadius: 9999 }}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${isActive ? 'text-brand' : ''}`} weight={isActive ? "fill" : "regular"} />
                    {item.name}
                </span>
              </motion.div>
            </Link>
          );
        })}
      </nav>

      {/* Right Actions */}
      <div className="pointer-events-auto flex items-center gap-3">
        {/* Settings Button */}
         {/* <motion.button
          className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <GearSix className="h-5 w-5" weight="regular" />
        </motion.button> */}

        {user ? (
          <motion.div
             className="flex items-center gap-2 rounded-full bg-white border border-slate-200 pl-1 pr-3 py-1 shadow-sm cursor-pointer hover:shadow-md transition-all"
             whileHover={{ scale: 1.02 }}
             whileTap={{ scale: 0.98 }}
          >
             {user.image ? (
              <img
                src={user.image}
                alt="Avatar"
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand to-red-500 text-xs font-bold text-white">
                {getInitials(user.name)}
              </div>
            )}
             <span className="text-sm font-medium text-gray-700 max-w-[100px] truncate">
                {user.name}
             </span>
          </motion.div>
        ) : (
             <motion.button
            onClick={handleSignIn}
            className="rounded-full bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-gray-800 shadow-lg shadow-gray-900/20"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Sign In
          </motion.button>
        )}
      </div>
    </header>
  );
}
