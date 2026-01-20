'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { PlayCircle } from '@phosphor-icons/react';

export default function LandingHero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-20 lg:pt-40 lg:pb-28">
      {/* Background Gradients */}
      <div className="absolute inset-0 -z-10 transform-gpu overflow-hidden blur-3xl" aria-hidden="true">
        <div
          className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-[#ff80b5] to-[#FF6B50] opacity-30 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"
          style={{
            clipPath:
              'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
          }}
        />
      </div>

      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="mb-8 flex justify-center">
              <div className="relative rounded-full px-3 py-1 text-sm leading-6 text-gray-600 ring-1 ring-gray-900/10 hover:ring-gray-900/20">
                Announcing our new video engine.{' '}
                <a href="#" className="font-semibold text-brand">
                  <span className="absolute inset-0" aria-hidden="true" />
                  Read more <span aria-hidden="true">&rarr;</span>
                </a>
              </div>
            </div>

            <h1 className="text-6xl font-bold tracking-tighter text-gray-900 sm:text-7xl mb-6">
              Video creation, <br/>
              <span className="text-brand">reimagined.</span>
            </h1>

            <p className="mt-6 text-xl leading-8 text-gray-600 max-w-2xl mx-auto">
              AI-powered storytelling for everyone. Turn your ideas into professional videos in seconds, not hours. No editing skills required.
            </p>

            <div className="mt-10 flex items-center justify-center gap-x-6">
              <Link href="/auth/signup">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="rounded-xl bg-brand px-8 py-4 text-lg font-bold text-white shadow-lg transition-all hover:bg-red-600 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                >
                  Start Creating for Free
                </motion.button>
              </Link>
              <a href="#demo" className="text-sm font-semibold leading-6 text-gray-900 flex items-center gap-2">
                <PlayCircle size={24} className="text-gray-900" />
                Watch Demo
              </a>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
