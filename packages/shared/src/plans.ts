const YEARLY_PAID_MONTHS = 10

const PLANS = [
    {
        id: 'cx23',
        name: 'CX23',
        cpu: 2,
        memory: 4,
        disk: 40,
        priceMonthly: 10,
        architecture: 'x86'
    },
    {
        id: 'cx33',
        name: 'CX33',
        cpu: 4,
        memory: 8,
        disk: 80,
        priceMonthly: 15,
        architecture: 'x86'
    },
    {
        id: 'cx43',
        name: 'CX43',
        cpu: 8,
        memory: 16,
        disk: 160,
        priceMonthly: 20,
        architecture: 'x86'
    },
    {
        id: 'cx53',
        name: 'CX53',
        cpu: 16,
        memory: 32,
        disk: 320,
        priceMonthly: 30,
        architecture: 'x86'
    },
    {
        id: 'cpx11',
        name: 'CPX11',
        cpu: 2,
        memory: 2,
        disk: 40,
        priceMonthly: 15,
        architecture: 'x86'
    },
    {
        id: 'cpx21',
        name: 'CPX21',
        cpu: 3,
        memory: 4,
        disk: 80,
        priceMonthly: 20,
        architecture: 'x86'
    },
    {
        id: 'cpx31',
        name: 'CPX31',
        cpu: 4,
        memory: 8,
        disk: 160,
        priceMonthly: 30,
        architecture: 'x86'
    },
    {
        id: 'cpx41',
        name: 'CPX41',
        cpu: 8,
        memory: 16,
        disk: 240,
        priceMonthly: 50,
        architecture: 'x86'
    },
    {
        id: 'cpx51',
        name: 'CPX51',
        cpu: 16,
        memory: 32,
        disk: 360,
        priceMonthly: 75,
        architecture: 'x86'
    },
    {
        id: 'cax11',
        name: 'CAX11',
        cpu: 2,
        memory: 4,
        disk: 40,
        priceMonthly: 10,
        architecture: 'arm64'
    },
    {
        id: 'cax21',
        name: 'CAX21',
        cpu: 4,
        memory: 8,
        disk: 80,
        priceMonthly: 15,
        architecture: 'arm64'
    },
    {
        id: 'cax31',
        name: 'CAX31',
        cpu: 8,
        memory: 16,
        disk: 160,
        priceMonthly: 25,
        architecture: 'arm64'
    },
    {
        id: 'cax41',
        name: 'CAX41',
        cpu: 16,
        memory: 32,
        disk: 320,
        priceMonthly: 50,
        architecture: 'arm64'
    },
    {
        id: 'ccx13',
        name: 'CCX13',
        cpu: 2,
        memory: 8,
        disk: 80,
        priceMonthly: 25,
        architecture: 'x86'
    },
    {
        id: 'ccx23',
        name: 'CCX23',
        cpu: 4,
        memory: 16,
        disk: 160,
        priceMonthly: 50,
        architecture: 'x86'
    },
    {
        id: 'ccx33',
        name: 'CCX33',
        cpu: 8,
        memory: 32,
        disk: 240,
        priceMonthly: 100,
        architecture: 'x86'
    },
    {
        id: 'ccx43',
        name: 'CCX43',
        cpu: 16,
        memory: 64,
        disk: 360,
        priceMonthly: 150,
        architecture: 'x86'
    },
    {
        id: 'ccx53',
        name: 'CCX53',
        cpu: 32,
        memory: 128,
        disk: 600,
        priceMonthly: 250,
        architecture: 'x86'
    },
    {
        id: 'ccx63',
        name: 'CCX63',
        cpu: 48,
        memory: 192,
        disk: 960,
        priceMonthly: 350,
        architecture: 'x86'
    }
].map((p) => ({
    ...p,
    priceYearly: p.priceMonthly * YEARLY_PAID_MONTHS
}))

export { PLANS, YEARLY_PAID_MONTHS }