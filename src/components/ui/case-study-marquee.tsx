'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, useTransform, useMotionValue, animate } from 'framer-motion';
import { cn } from '@/lib/utils';

interface CaseStudy {
    id: number;
    title: string;
    image: string;
    href: string;
}

const SvgPath = React.forwardRef<SVGPathElement, React.SVGProps<SVGPathElement>>((props, ref) => (
    <svg width="100%" height="200" viewBox="0 0 1800 200" preserveAspectRatio="none" className="absolute top-0 left-0">
        <path
            ref={ref}
            d="M0,100 C600,0 1200,0 1800,100"
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="2"
            {...props}
        />
    </svg>
));
SvgPath.displayName = "SvgPath";

const CaseStudyItem = ({ study, pathEl, baseProgress, index, totalItems }: { study: CaseStudy, pathEl: SVGPathElement, baseProgress: any, index: number, totalItems: number }) => {
    const [pathLength, setPathLength] = React.useState(0);

    const itemProgress = useTransform(baseProgress, (v) => {
        const offset = index / totalItems;
        return (v + offset) % 1;
    });

    React.useLayoutEffect(() => {
        setPathLength(pathEl.getTotalLength());
    }, [pathEl]);

    const point = useTransform(itemProgress, (value) => {
        if (pathLength === 0) return { x: 0, y: 0 };
        const distance = value * pathLength;
        const { x, y } = pathEl.getPointAtLength(distance);
        return { x, y };
    });

    const x = useTransform(point, p => p.x - 75); // Offset by half of item width
    const y = useTransform(point, p => p.y - 50); // Offset by half of item height

    return (
        <motion.div
            style={{
                position: 'absolute',
                left: 0,
                top: 0,
                x,
                y,
            }}
            className="w-[150px] h-[100px]"
        >
            <Link href={study.href} className="block group relative w-full h-full">
                <Image
                    src={study.image}
                    alt={study.title}
                    width={150}
                    height={100}
                    className="rounded-lg shadow-lg object-cover w-full h-full transition-transform duration-300 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <span className="text-center text-white text-sm font-bold p-2">{study.title}</span>
                </div>
            </Link>
        </motion.div>
    );
};

export const CaseStudyMarquee = ({ studies, className }: { studies: CaseStudy[], className?: string }) => {
    const pathRef = React.useRef<SVGPathElement>(null);
    const [pathEl, setPathEl] = React.useState<SVGPathElement | null>(null);

    React.useEffect(() => {
        if (pathRef.current) {
            setPathEl(pathRef.current);
        }
    }, []);

    const progress = useMotionValue(0);

    React.useEffect(() => {
        const animation = animate(progress, 1, {
            duration: 15,
            repeat: Infinity,
            ease: "linear",
        });
        return () => animation.stop();
    }, [progress]);

    return (
        <div className={cn("relative h-[300px] w-full overflow-hidden", className)}>
            <SvgPath ref={pathRef} />
            <div className="relative w-full h-full">
                {pathEl && studies.map((study, index) => (
                    <CaseStudyItem
                        key={study.id}
                        study={study}
                        pathEl={pathEl}
                        baseProgress={progress}
                        index={index}
                        totalItems={studies.length}
                    />
                ))}
            </div>
        </div>
    );
};