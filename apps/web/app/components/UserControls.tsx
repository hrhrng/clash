'use client';

/* eslint-disable @next/next/no-img-element */

import { motion } from 'framer-motion';
import { GoogleLogo } from '@phosphor-icons/react';
import betterAuthClient from '@/lib/betterAuthClient';

export default function UserControls() {
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
    <div className="flex items-center gap-3">
      {user ? (
        <motion.div
           className="flex items-center gap-3 rounded-full bg-white border border-slate-200 pl-1.5 pr-4 py-1.5 shadow-sm cursor-pointer hover:shadow-md transition-all"
           whileHover={{ scale: 1.02 }}
           whileTap={{ scale: 0.98 }}
           onClick={handleSignOut}
        >
           {user.image ? (
            <img
              src={user.image}
              alt="Avatar"
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand to-red-500 text-sm font-bold text-white">
              {getInitials(user.name)}
            </div>
          )}
           <span className="text-base font-display font-medium text-gray-700 max-w-[120px] truncate">
              {user.name}
           </span>
        </motion.div>
      ) : (
           <motion.button
          onClick={handleSignIn}
          className="flex items-center gap-2 rounded-full bg-gray-900 px-6 py-3 text-base font-display font-medium text-white transition-all hover:bg-gray-800 shadow-lg shadow-gray-900/20"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <GoogleLogo weight="bold" className="h-5 w-5" />
          Sign in with Google
        </motion.button>
      )}
    </div>
  );
}
