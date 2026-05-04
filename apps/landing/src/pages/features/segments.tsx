import {Footer, Navbar} from '../../components';
import {motion} from 'framer-motion';
import {DASHBOARD_URI, WIKI_URI} from '../../lib/constants';
import React from 'react';
import Link from 'next/link';
import {ArrowRight, Filter, GitBranch, Mail, Target, TrendingUp, Users} from 'lucide-react';
import Head from 'next/head';

const features = [
  {
    icon: <Filter className="h-6 w-6" strokeWidth={1.5} />,
    title: 'Dynamic Filtering',
    description: 'Create segments based on contact data, custom fields, email activity, and events with powerful AND/OR logic.',
    featured: true,
  },
  {
    icon: <TrendingUp className="h-6 w-6" strokeWidth={1.5} />,
    title: 'Real-Time Updates',
    description: 'Dynamic segments automatically update as contact data changes, always keeping your audience current.',
  },
  {
    icon: <GitBranch className="h-6 w-6" strokeWidth={1.5} />,
    title: 'Workflow Integration',
    description: 'Trigger workflows when contacts enter or exit segments, or use segment conditions in workflow branching.',
  },
  {
    icon: <Target className="h-6 w-6" strokeWidth={1.5} />,
    title: 'Campaign Targeting',
    description: 'Send targeted campaigns to specific segments instead of your entire contact list. Less noise, more signal.',
  },
  {
    icon: <Users className="h-6 w-6" strokeWidth={1.5} />,
    title: 'Static Segments',
    description: 'Manually curate contact lists for special groups like beta testers or VIP customers.',
  },
  {
    icon: <Mail className="h-6 w-6" strokeWidth={1.5} />,
    title: 'Behavior-Based',
    description: 'Segment by email engagement — who opened, clicked, bounced, or never received your emails.',
  },
];

const filterExamples = [
  {
    title: 'Active Users',
    description: 'Target users who signed up recently and are actively engaging',
    filters: ['Created within 30 days', 'Opened email within 7 days', 'Custom field: plan equals "pro"'],
  },
  {
    title: 'Re-engagement Needed',
    description: 'Find inactive users who need a nudge to come back',
    filters: ['Last activity older than 60 days', 'Email sent but not opened', 'Subscribed equals true'],
  },
  {
    title: 'High-Value Customers',
    description: 'Identify your most valuable customers for special treatment',
    filters: ['Custom field: totalSpent greater than 1000', 'Triggered event: purchase', 'Plan equals "enterprise"'],
  },
];

const useCases = [
  {
    icon: <Mail className="h-6 w-6" strokeWidth={1.5} />,
    title: 'Targeted Campaigns',
    description:
      'Send newsletters and announcements to specific audience segments instead of blasting everyone. Increase open rates by sending relevant content to the right people.',
  },
  {
    icon: <GitBranch className="h-6 w-6" strokeWidth={1.5} />,
    title: 'Behavior-Based Workflows',
    description:
      'Trigger workflows when contacts enter segments like "VIP Customers" or "Churning Users". Create personalized automations based on segment membership.',
  },
  {
    icon: <Target className="h-6 w-6" strokeWidth={1.5} />,
    title: 'A/B Testing',
    description:
      'Create segments for test groups and control groups. Send different campaigns to each segment and measure results.',
  },
];

export default function SegmentsFeature() {
  return (
    <>
      <Head>
        <title>Audience Segmentation - Target the Right Contacts | Plunk</title>
        <meta
          name="description"
          content="Create dynamic and static segments to organize your contacts. Filter by behavior, attributes, and engagement. Target campaigns and trigger workflows based on segment membership."
        />
        <meta property="og:title" content="Audience Segmentation - Smart Contact Organization | Plunk" />
        <meta
          property="og:description"
          content="Create dynamic and static segments to organize your contacts. Filter by behavior, attributes, and engagement."
        />
        <meta property="og:image" content="https://www.useplunk.com/api/og?title=Audience+Segmentation&tag=Feature" />
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:image" content="https://www.useplunk.com/api/og?title=Audience+Segmentation&tag=Feature" />
      </Head>

      <Navbar />

      <main className={'text-neutral-800'}>

        {/* Hero */}
        <section className={'relative overflow-hidden'}>
          <div
            aria-hidden
            className={
              'absolute inset-0 -z-10 h-full w-full bg-white bg-[linear-gradient(to_right,#eeeeee_1px,transparent_1px),linear-gradient(to_bottom,#eeeeee_1px,transparent_1px)] bg-[size:6rem_6rem] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_30%,#000_40%,transparent_95%)]'
            }
          />
          <div className={'mx-auto max-w-[88rem] px-6 pb-20 pt-20 sm:px-10 sm:pt-28 sm:pb-28'}>
            <motion.div
              initial={{opacity: 0, y: 16}}
              animate={{opacity: 1, y: 0}}
              transition={{duration: 0.7, ease: [0.22, 1, 0.36, 1]}}
            >
              <div
                style={{fontFamily: 'var(--font-mono)'}}
                className={'mb-10 border-t border-neutral-900/90 pt-4 text-[11px] uppercase tracking-[0.18em] text-neutral-700'}
              >
                <span className={'text-neutral-400'}>Features</span>
                <span className={'mx-3 text-neutral-300'}>—</span>
                <span className={'font-medium text-neutral-900'}>Audience Segmentation</span>
              </div>
              <h1
                style={{fontFamily: 'var(--font-display)'}}
                className={
                  'text-[clamp(2.75rem,7vw,6.5rem)] font-extrabold leading-[0.92] tracking-[-0.04em] text-neutral-900'
                }
              >
                Target the right audience,
                <br />
                every time.
              </h1>
              <p className={'mt-6 max-w-2xl text-xl text-neutral-600'}>
                Organize contacts into dynamic segments based on behavior, attributes, and engagement. Send targeted
                campaigns and trigger personalized workflows.
              </p>

              <div className={'mt-10 flex flex-wrap gap-3'}>
                <motion.a
                  whileHover={{scale: 1.015}}
                  whileTap={{scale: 0.985}}
                  href={`${DASHBOARD_URI}/auth/signup`}
                  className={
                    'group inline-flex items-center gap-2 rounded-full bg-neutral-900 px-8 py-4 text-base font-semibold text-white shadow-[0_10px_30px_-10px_rgba(23,23,23,0.35)] transition hover:bg-neutral-800'
                  }
                >
                  Start segmenting
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </motion.a>
                <Link
                  href={WIKI_URI}
                  target={'_blank'}
                  className={
                    'inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-8 py-4 text-base font-semibold text-neutral-900 transition hover:border-neutral-900'
                  }
                >
                  View documentation
                </Link>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Features grid */}
        <section className={'border-t border-neutral-200'}>
          <div className={'mx-auto max-w-[88rem] px-6 py-24 sm:px-10 sm:py-32'}>
            <motion.div
              initial={{opacity: 0, y: 20}}
              whileInView={{opacity: 1, y: 0}}
              viewport={{once: true}}
              transition={{duration: 0.7, ease: [0.22, 1, 0.36, 1]}}
              className={'mb-16'}
            >
              <h2
                style={{fontFamily: 'var(--font-display)'}}
                className={'text-[clamp(2rem,5vw,4rem)] font-extrabold leading-[0.95] tracking-[-0.03em] text-neutral-900'}
              >
                The right message to the right person
              </h2>
              <p className={'mt-4 text-lg text-neutral-600'}>Build precise audiences and send campaigns that land</p>
            </motion.div>

            <div className={'grid gap-5 sm:grid-cols-2 lg:grid-cols-3'}>
              {features.map((feature, index) => {
                const highlighted = feature.featured;
                return (
                  <motion.div
                    key={feature.title}
                    initial={{opacity: 0, y: 16}}
                    whileInView={{opacity: 1, y: 0}}
                    viewport={{once: true}}
                    transition={{duration: 0.5, delay: index * 0.06, ease: [0.22, 1, 0.36, 1]}}
                    className={
                      highlighted
                        ? 'flex min-h-[16rem] flex-col justify-between rounded-[28px] border border-neutral-900 bg-neutral-900 p-8 text-white'
                        : 'flex min-h-[16rem] flex-col justify-between rounded-[28px] border border-neutral-200 bg-white p-8 transition hover:border-neutral-900'
                    }
                  >
                    <div className={'flex items-start justify-between'}>
                      <div className={highlighted ? 'text-white' : 'text-neutral-900'}>{feature.icon}</div>
                      <span
                        style={{fontFamily: 'var(--font-mono)'}}
                        className={`text-[11px] uppercase tracking-[0.18em] ${highlighted ? 'text-neutral-500' : 'text-neutral-400'}`}
                      >
                        {String(index + 1).padStart(2, '0')}
                      </span>
                    </div>
                    <div>
                      <h3
                        style={{fontFamily: 'var(--font-display)'}}
                        className={`mt-8 text-xl font-bold tracking-[-0.02em] ${highlighted ? 'text-white' : 'text-neutral-900'}`}
                      >
                        {feature.title}
                      </h3>
                      <p className={`mt-2 text-sm leading-relaxed ${highlighted ? 'text-neutral-300' : 'text-neutral-600'}`}>
                        {feature.description}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Filter examples */}
        <section className={'border-t border-neutral-200 bg-neutral-50/60'}>
          <div className={'mx-auto max-w-[88rem] px-6 py-24 sm:px-10 sm:py-32'}>
            <motion.div
              initial={{opacity: 0, y: 20}}
              whileInView={{opacity: 1, y: 0}}
              viewport={{once: true}}
              transition={{duration: 0.7, ease: [0.22, 1, 0.36, 1]}}
              className={'mb-16'}
            >
              <h2
                style={{fontFamily: 'var(--font-display)'}}
                className={'text-[clamp(2rem,5vw,4rem)] font-extrabold leading-[0.95] tracking-[-0.03em] text-neutral-900'}
              >
                Flexible filtering options
              </h2>
              <p className={'mt-4 text-lg text-neutral-600'}>Build complex segments with nested AND/OR logic</p>
            </motion.div>

            <div className={'space-y-5'}>
              {filterExamples.map((example, index) => (
                <motion.div
                  key={example.title}
                  initial={{opacity: 0, y: 20}}
                  whileInView={{opacity: 1, y: 0}}
                  viewport={{once: true}}
                  transition={{duration: 0.5, delay: index * 0.1, ease: [0.22, 1, 0.36, 1]}}
                  className={'rounded-[24px] border border-neutral-200 bg-white p-8'}
                >
                  <h3
                    style={{fontFamily: 'var(--font-display)'}}
                    className={'text-xl font-bold tracking-[-0.02em] text-neutral-900'}
                  >
                    {example.title}
                  </h3>
                  <p className={'mt-1 text-neutral-600'}>{example.description}</p>
                  <div className={'mt-6 space-y-2'}>
                    {example.filters.map((filter, filterIndex) => (
                      <div key={filterIndex} className={'flex items-center gap-3 rounded-xl border border-neutral-100 bg-neutral-50 px-4 py-3'}>
                        <Filter className="h-4 w-4 flex-shrink-0 text-neutral-400" />
                        <span style={{fontFamily: 'var(--font-mono)'}} className={'text-sm text-neutral-700'}>
                          {filter}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Segment types */}
        <section className={'border-t border-neutral-200'}>
          <div className={'mx-auto max-w-[88rem] px-6 py-24 sm:px-10 sm:py-32'}>
            <motion.div
              initial={{opacity: 0, y: 20}}
              whileInView={{opacity: 1, y: 0}}
              viewport={{once: true}}
              transition={{duration: 0.7, ease: [0.22, 1, 0.36, 1]}}
              className={'mb-16'}
            >
              <h2
                style={{fontFamily: 'var(--font-display)'}}
                className={'text-[clamp(2rem,5vw,4rem)] font-extrabold leading-[0.95] tracking-[-0.03em] text-neutral-900'}
              >
                Two types of segments
              </h2>
              <p className={'mt-4 text-lg text-neutral-600'}>Choose between dynamic filtering or manual curation</p>
            </motion.div>

            <div className={'grid gap-5 sm:grid-cols-2'}>
              {[
                {
                  icon: <TrendingUp className="h-6 w-6" strokeWidth={1.5} />,
                  title: 'Dynamic Segments',
                  description: 'Automatically update based on filter conditions. As contact data changes, segment membership updates in real-time.',
                  bullets: ['Filter-based membership', 'Automatic updates', 'Optional entry/exit tracking'],
                },
                {
                  icon: <Users className="h-6 w-6" strokeWidth={1.5} />,
                  title: 'Static Segments',
                  description: 'Manually curate your segment by adding specific contacts. Membership stays fixed until you change it.',
                  bullets: ['Manual contact selection', 'Fixed membership', 'Perfect for VIP lists'],
                },
              ].map((type, i) => (
                <motion.div
                  key={type.title}
                  initial={{opacity: 0, y: 16}}
                  whileInView={{opacity: 1, y: 0}}
                  viewport={{once: true}}
                  transition={{duration: 0.5, delay: i * 0.1, ease: [0.22, 1, 0.36, 1]}}
                  className={'rounded-[24px] border border-neutral-200 bg-white p-8'}
                >
                  <div className={'text-neutral-900'}>{type.icon}</div>
                  <h3
                    style={{fontFamily: 'var(--font-display)'}}
                    className={'mt-6 text-xl font-bold tracking-[-0.02em] text-neutral-900'}
                  >
                    {type.title}
                  </h3>
                  <p className={'mt-2 text-neutral-600'}>{type.description}</p>
                  <ul className={'mt-6 space-y-2'}>
                    {type.bullets.map(b => (
                      <li key={b} className={'flex items-center gap-2 text-sm text-neutral-600'}>
                        <div className={'h-1.5 w-1.5 flex-shrink-0 rounded-full bg-neutral-900'} />
                        {b}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Use cases */}
        <section className={'border-t border-neutral-200 bg-neutral-50/60'}>
          <div className={'mx-auto max-w-[88rem] px-6 py-24 sm:px-10 sm:py-32'}>
            <motion.div
              initial={{opacity: 0, y: 20}}
              whileInView={{opacity: 1, y: 0}}
              viewport={{once: true}}
              transition={{duration: 0.7, ease: [0.22, 1, 0.36, 1]}}
              className={'mb-16'}
            >
              <h2
                style={{fontFamily: 'var(--font-display)'}}
                className={'text-[clamp(2rem,5vw,4rem)] font-extrabold leading-[0.95] tracking-[-0.03em] text-neutral-900'}
              >
                Use segments everywhere
              </h2>
              <p className={'mt-4 text-lg text-neutral-600'}>From targeted campaigns to automated workflows</p>
            </motion.div>

            <ul className={'divide-y divide-neutral-200 border-y border-neutral-200'}>
              {useCases.map((useCase, index) => (
                <motion.li
                  key={useCase.title}
                  initial={{opacity: 0, y: 12}}
                  whileInView={{opacity: 1, y: 0}}
                  viewport={{once: true}}
                  transition={{duration: 0.5, delay: index * 0.08, ease: [0.22, 1, 0.36, 1]}}
                  className={'grid grid-cols-12 gap-6 py-10 sm:py-12'}
                >
                  <span
                    style={{fontFamily: 'var(--font-mono)'}}
                    className={'col-span-12 text-[11px] uppercase tracking-[0.18em] text-neutral-400 sm:col-span-1 sm:pt-1.5'}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3
                    style={{fontFamily: 'var(--font-display)'}}
                    className={'col-span-12 text-xl font-bold tracking-[-0.02em] text-neutral-900 sm:col-span-3'}
                  >
                    {useCase.title}
                  </h3>
                  <p className={'col-span-12 leading-relaxed text-neutral-600 sm:col-span-8'}>
                    {useCase.description}
                  </p>
                </motion.li>
              ))}
            </ul>
          </div>
        </section>

        {/* CTA */}
        <section className={'relative overflow-hidden border-t border-neutral-900 bg-neutral-900 text-white'}>
          <div className={'mx-auto max-w-[88rem] px-6 py-32 sm:px-10 sm:py-40'}>
            <div className={'flex flex-col items-start gap-12 lg:flex-row lg:items-end lg:justify-between'}>
              <motion.h2
                initial={{opacity: 0, y: 16}}
                whileInView={{opacity: 1, y: 0}}
                viewport={{once: true}}
                transition={{duration: 0.9, ease: [0.22, 1, 0.36, 1]}}
                style={{fontFamily: 'var(--font-display)'}}
                className={'text-[clamp(2.5rem,7vw,6rem)] font-extrabold leading-[0.95] tracking-[-0.035em]'}
              >
                Stop sending the same email to everyone.
              </motion.h2>
              <motion.div
                initial={{opacity: 0, y: 16}}
                whileInView={{opacity: 1, y: 0}}
                viewport={{once: true}}
                transition={{duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1]}}
                className={'flex max-w-md flex-col gap-6'}
              >
                <p className={'text-base text-neutral-300 sm:text-lg'}>
                  Build precise audience segments and watch your open rates climb. 1,000 emails free, no credit card
                  required.
                </p>
                <div className={'flex flex-wrap gap-3'}>
                  <motion.a
                    whileHover={{scale: 1.015}}
                    whileTap={{scale: 0.985}}
                    href={`${DASHBOARD_URI}/auth/signup`}
                    className={'inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100'}
                  >
                    Get started for free
                    <ArrowRight className="h-4 w-4" />
                  </motion.a>
                  <Link
                    href={'/pricing'}
                    className={'inline-flex items-center gap-2 rounded-full border border-neutral-700 px-7 py-3.5 text-sm font-semibold text-white transition hover:border-white'}
                  >
                    View pricing
                  </Link>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

      </main>

      <Footer />
    </>
  );
}
