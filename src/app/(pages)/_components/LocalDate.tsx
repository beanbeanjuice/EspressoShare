'use client';

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

type LocalDateProps = { date: Date | string };

const LocalDate = ({ date }: LocalDateProps) => {
    const isClient = useSyncExternalStore(subscribe, () => true, () => false);
    const d = new Date(date);

    return (
        <time dateTime={d.toISOString()}>
            {isClient ? d.toLocaleString() : ""}
        </time>
    );
};

export default LocalDate;
