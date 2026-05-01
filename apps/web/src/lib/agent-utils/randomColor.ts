import { AVATAR_COLORS } from '@/lib/constants'

const randomColor = () =>
    AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]

export default randomColor