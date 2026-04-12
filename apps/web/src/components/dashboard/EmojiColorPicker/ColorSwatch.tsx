import type { FC, ReactNode } from 'react'
import type { ColorSwatchProps } from '@/ts/Interfaces'

const ColorSwatch: FC<ColorSwatchProps> = ({ color, selected, onClick }): ReactNode => (
    <button
        onClick={onClick}
        className={`h-6 w-6 rounded-md transition-all ${!color ? 'bg-muted' : ''} ${selected ? 'ring-foreground/50 ring-2 ring-offset-1 ring-offset-transparent' : 'hover:scale-110'}`}
        style={color ? { backgroundColor: color } : undefined}
    />
)

export default ColorSwatch