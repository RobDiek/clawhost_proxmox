import 'dotenv/config'
import { Polar } from '@polar-sh/sdk'
import { getProvider } from '@/services/provider'

const customPrices: Record<string, Record<string, number>> = {
    hetzner: {
        cx23: 25,
        cx33: 35,
        cx43: 50,
        cx53: 60,
        cpx11: 30,
        cpx21: 40,
        cpx31: 50,
        cpx41: 75,
        cpx51: 120,
        cax11: 30,
        cax21: 40,
        cax31: 50,
        cax41: 75,
        ccx13: 40,
        ccx23: 60,
        ccx33: 90,
        ccx43: 140,
        ccx53: 250,
        ccx63: 350
    }
}

const ANNUAL_DISCOUNT_MONTHS = 10

async function main() {
    const providerName = (process.argv[2] || 'hetzner') as 'hetzner'

    const billingInterval = (process.argv[3] || 'both') as
        | 'month'
        | 'year'
        | 'both'

    const prices = customPrices[providerName]
    if (!prices) {
        console.error(`❌ Unknown provider: ${providerName}`)
        process.exit(1)
    }

    console.log(
        `🚀 Creating Polar products for ${providerName} plans (${billingInterval})...\n`
    )

    const accessToken = process.env.POLAR_ACCESS_TOKEN

    if (!accessToken || accessToken.includes('REPLACE')) {
        console.error('❌ POLAR_ACCESS_TOKEN is not set in .env')
        process.exit(1)
    }

    const polar = new Polar({ accessToken })

    console.log(`📦 Fetching ${providerName} server types...`)
    const provider = getProvider(providerName)
    const serverTypes = await provider.getServerTypes()
    console.log(`   Found ${serverTypes.length} server types\n`)

    const whitelistedPlans = serverTypes.filter(
        (st) => prices[st.name] !== undefined
    )
    console.log(`   ${whitelistedPlans.length} plans in whitelist\n`)

    const createdProducts: {
        planId: string
        productId: string
        price: number
        interval: string
    }[] = []
    const envLines: string[] = []

    const intervals: Array<'month' | 'year'> =
        billingInterval === 'both' ? ['month', 'year'] : [billingInterval]

    for (const plan of whitelistedPlans) {
        const priceMonthly = prices[plan.name]

        for (const interval of intervals) {
            const priceCents =
                interval === 'year'
                    ? Math.round(priceMonthly * ANNUAL_DISCOUNT_MONTHS * 100)
                    : Math.round(priceMonthly * 100)

            const intervalLabel = interval === 'year' ? 'Yearly' : 'Monthly'
            const productName = `Claw - ${plan.description} (${intervalLabel})`
            const productDescription = `${plan.description} (${plan.cores} vCPU, ${plan.memory}GB RAM, ${plan.disk}GB SSD)`

            const displayPrice =
                interval === 'year'
                    ? `$${(priceMonthly * ANNUAL_DISCOUNT_MONTHS).toFixed(0)}/yr`
                    : `$${priceMonthly}/mo`

            console.log(`Creating: ${productName}`)
            console.log(`   Specs: ${productDescription}`)
            console.log(`   Price: ${displayPrice} (${priceCents} cents)`)

            try {
                const product = await polar.products.create({
                    name: productName,
                    description: productDescription,
                    recurringInterval: interval,
                    prices: [
                        {
                            amountType: 'fixed',
                            priceAmount: priceCents,
                            priceCurrency: 'usd'
                        }
                    ]
                })

                createdProducts.push({
                    planId: plan.name,
                    productId: product.id,
                    price: priceCents / 100,
                    interval
                })

                const suffix = interval === 'year' ? '_YEARLY' : '_MONTHLY'
                const envKey = `POLAR_PRODUCT_${plan.description.toUpperCase().replace(/\s+/g, '')}${suffix}`
                envLines.push(`${envKey}=${product.id}`)

                console.log(`   ✅ Created: ${product.id}\n`)
            } catch (err) {
                console.error(
                    `   ❌ Failed: ${err instanceof Error ? err.message : err}\n`
                )
            }
        }
    }

    console.log('\n' + '='.repeat(70))
    console.log('📋 SUMMARY')
    console.log('='.repeat(70))
    console.log(`\nCreated ${createdProducts.length} products\n`)

    if (createdProducts.length > 0) {
        console.log('Add these to your .env file:\n')
        console.log(`# Polar Product IDs for ${providerName} (auto-generated)`)
        envLines.forEach((line) => console.log(line))
        console.log('')
    }

    console.log('\nProduct mapping:')
    console.log('-'.repeat(70))
    console.log(
        'Plan ID'.padEnd(20) +
            'Interval'.padEnd(10) +
            'Price'.padEnd(14) +
            'Product ID'
    )
    console.log('-'.repeat(70))
    createdProducts.forEach((p) => {
        const priceLabel =
            p.interval === 'year' ? `$${p.price}/yr` : `$${p.price}/mo`
        console.log(
            p.planId.padEnd(20) +
                p.interval.padEnd(10) +
                priceLabel.padEnd(14) +
                p.productId
        )
    })
    console.log('-'.repeat(70))
}

main().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
})