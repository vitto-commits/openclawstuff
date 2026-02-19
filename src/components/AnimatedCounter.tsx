'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView, useMotionValue, useSpring, motion } from 'framer-motion';

interface Props {
  value: number;
  format?: (n: number) => string;
  className?: string;
  duration?: number;
}

export default function AnimatedCounter({ value, format, className, duration = 0.8 }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { duration: duration * 1000, bounce: 0 });
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    if (inView) motionVal.set(value);
  }, [inView, value, motionVal]);

  useEffect(() => {
    const unsub = spring.on('change', (v) => {
      setDisplay(format ? format(v) : Math.round(v).toString());
    });
    return unsub;
  }, [spring, format]);

  return <motion.span ref={ref} className={className}>{display}</motion.span>;
}
