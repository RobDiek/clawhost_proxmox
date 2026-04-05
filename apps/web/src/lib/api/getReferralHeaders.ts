import getReferralCode from '@/lib/api/getReferralCode'

const getReferralHeaders = (): Record<string, string> => {
    const code = getReferralCode()
    return code ? { 'X-Referral-Code': code } : {}
}

export default getReferralHeaders