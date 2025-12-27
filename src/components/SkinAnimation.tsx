
import Lottie from 'lottie-react';
import { useRive } from '@rive-app/react-canvas';
import { useSkin } from '../contexts/SkinContext';
import { useEffect, useState } from 'react';

interface SkinAnimationProps {
    animationKey: string;
    className?: string;
    fallback?: React.ReactNode;
}

export const SkinAnimation = ({ animationKey, className, fallback }: SkinAnimationProps) => {
    const { getAnimation } = useSkin();
    const animation = getAnimation(animationKey);
    const [lottieData, setLottieData] = useState<any>(null);

    // Rive hook (conditionally used)
    const { RiveComponent } = useRive({
        src: animation?.type === 'rive' ? animation.path : undefined, // In a real app, path needs to be resolved to URL or base64
        autoplay: animation?.autoplay ?? true,
        stateMachines: animation?.stateMachine,
    });

    useEffect(() => {
        if (animation?.type === 'lottie' && animation.path) {
            // For Lottie, we need to load the JSON content
            // In a real Electron app, we'd read the file. 
            // Here we assume path is a URL or we need to fetch it.
            // If it's a local path in Electron, we might need a custom protocol or readFile.
            // For simplicity in this step, let's assume it's fetchable.
            fetch(animation.path)
                .then(res => res.json())
                .then(data => setLottieData(data))
                .catch(err => console.error("Failed to load Lottie:", err));
        }
    }, [animation]);

    if (!animation) {
        return <>{fallback}</>;
    }

    if (animation.type === 'lottie' && lottieData) {
        return (
            <div className={className}>
                <Lottie
                    animationData={lottieData}
                    loop={animation.loop ?? true}
                    autoplay={animation.autoplay ?? true}
                />
            </div>
        );
    }

    if (animation.type === 'rive') {
        return (
            <div className={className}>
                <RiveComponent />
            </div>
        );
    }

    return <>{fallback}</>;
};
