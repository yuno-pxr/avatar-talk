
import { useState, useEffect } from 'react';

export const DateDisplay = () => {
    const [date, setDate] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => {
            setDate(new Date());
        }, 60000); // Update every minute is enough for date/time, but for just date, once a day?
        // But user might keep it open.
        // Also if we want time later, minute is good.
        return () => clearInterval(timer);
    }, []);

    const formatDate = (date: Date) => {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
        return `${yyyy}/${mm}/${dd} [${day}]`;
    };

    return (
        <div className="text-[10px] text-white/30 font-mono tracking-widest select-none">
            {formatDate(date)}
        </div>
    );
};
