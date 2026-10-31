'use client';

// Larpers dropdown: Radix Select (listbox semantics, keyboard, typeahead) styled to the brand.
import * as RS from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

export interface SelectOption {
    value: string;
    label: React.ReactNode;
    disabled?: boolean;
}

export interface SelectProps {
    name: string;
    value: string;
    onValueChange: (v: string) => void;
    options: SelectOption[];
    placeholder?: string;
    ariaLabel?: string;
    className?: string;
    disabled?: boolean;
}

export default function Select({ name, value, onValueChange, options, placeholder, ariaLabel, className = '', disabled }: SelectProps) {
    return (
        <RS.Root name={name} value={value} onValueChange={onValueChange} disabled={disabled}>
            <RS.Trigger
                aria-label={ariaLabel}
                data-select={name}
                className={`field group flex items-center justify-between gap-2 text-left data-[placeholder]:text-ink2 data-[state=open]:border-accent data-[state=open]:ring-1 data-[state=open]:ring-accent disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
            >
                <span className="min-w-0 truncate">
                    <RS.Value placeholder={placeholder} />
                </span>
                <RS.Icon className="shrink-0 text-ink2 transition-transform duration-150 group-data-[state=open]:rotate-180">
                    <ChevronDown size={18} strokeWidth={2.25} aria-hidden="true" />
                </RS.Icon>
            </RS.Trigger>
            <RS.Portal>
                <RS.Content className="lp-select-content" position="popper" sideOffset={4} collisionPadding={8}>
                    <RS.ScrollUpButton className="flex h-6 items-center justify-center text-ink2">
                        <ChevronUp size={16} aria-hidden="true" />
                    </RS.ScrollUpButton>
                    <RS.Viewport className="p-1">
                        {options.map((o) => (
                            <RS.Item key={o.value} value={o.value} disabled={o.disabled} className="lp-select-item">
                                <RS.ItemIndicator className="absolute left-2 inline-flex items-center text-accent">
                                    <Check size={16} strokeWidth={2.75} aria-hidden="true" />
                                </RS.ItemIndicator>
                                <RS.ItemText>{o.label}</RS.ItemText>
                            </RS.Item>
                        ))}
                    </RS.Viewport>
                    <RS.ScrollDownButton className="flex h-6 items-center justify-center text-ink2">
                        <ChevronDown size={16} aria-hidden="true" />
                    </RS.ScrollDownButton>
                </RS.Content>
            </RS.Portal>
        </RS.Root>
    );
}
