import type { CompareData } from '@/ts/Interfaces'

import { COMPARE_FEATURE_STATUS } from '@/lib/constants'

const getCompareData = (): CompareData => ({
    competitors: [
        {
            id: 'clawhost',
            nameKey: 'compare.competitorClawHost',
            highlighted: true
        },
        {
            id: 'lobsterfarm',
            nameKey: 'compare.competitorLobsterFarm',
            highlighted: false
        },
        {
            id: 'simpleclaw',
            nameKey: 'compare.competitorSimpleClaw',
            highlighted: false
        },
        {
            id: 'myclawai',
            nameKey: 'compare.competitorMyClawAi',
            highlighted: false
        },
        {
            id: 'quickclaw',
            nameKey: 'compare.competitorQuickClaw',
            highlighted: false
        }
    ],
    categories: [
        {
            id: 'infrastructure',
            nameKey: 'compare.categoryInfrastructure',
            features: [
                {
                    nameKey: 'compare.featureServerOwnership',
                    values: {
                        clawhost: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.dedicatedVps'
                        },
                        lobsterfarm: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.dedicatedVps'
                        },
                        simpleclaw: {
                            status: COMPARE_FEATURE_STATUS.PARTIAL,
                            detailKey: 'compare.sharedContainers'
                        },
                        myclawai: {
                            status: COMPARE_FEATURE_STATUS.PARTIAL,
                            detailKey: 'compare.isolatedContainers'
                        },
                        quickclaw: {
                            status: COMPARE_FEATURE_STATUS.NO,
                            detailKey: 'compare.cloudWorkspaces'
                        }
                    }
                },
                {
                    nameKey: 'compare.featureProviderChoice',
                    values: {
                        clawhost: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.threeProviders'
                        },
                        lobsterfarm: {
                            status: COMPARE_FEATURE_STATUS.NO,
                            detailKey: 'compare.singleProvider'
                        },
                        simpleclaw: {
                            status: COMPARE_FEATURE_STATUS.NO,
                            detailKey: 'compare.singleProvider'
                        },
                        myclawai: {
                            status: COMPARE_FEATURE_STATUS.NO,
                            detailKey: 'compare.singleProvider'
                        },
                        quickclaw: {
                            status: COMPARE_FEATURE_STATUS.NO,
                            detailKey: 'compare.singleProvider'
                        }
                    }
                },
                {
                    nameKey: 'compare.featureDedicatedResources',
                    values: {
                        clawhost: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.fullyDedicated'
                        },
                        lobsterfarm: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.fullyDedicated'
                        },
                        simpleclaw: {
                            status: COMPARE_FEATURE_STATUS.NO,
                            detailKey: 'compare.shared'
                        },
                        myclawai: {
                            status: COMPARE_FEATURE_STATUS.NO,
                            detailKey: 'compare.shared'
                        },
                        quickclaw: {
                            status: COMPARE_FEATURE_STATUS.NO,
                            detailKey: 'compare.shared'
                        }
                    }
                },
                {
                    nameKey: 'compare.featureRootAccess',
                    values: {
                        clawhost: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.fullRootSsh'
                        },
                        lobsterfarm: {
                            status: COMPARE_FEATURE_STATUS.PARTIAL,
                            detailKey: 'compare.sshOnRequest'
                        },
                        simpleclaw: { status: COMPARE_FEATURE_STATUS.NO },
                        myclawai: { status: COMPARE_FEATURE_STATUS.NO },
                        quickclaw: { status: COMPARE_FEATURE_STATUS.NO }
                    }
                },
                {
                    nameKey: 'compare.featureServerLocations',
                    values: {
                        clawhost: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.thirtyPlusLocations'
                        },
                        lobsterfarm: {
                            status: COMPARE_FEATURE_STATUS.PARTIAL,
                            detailKey: 'compare.fourLocations'
                        },
                        simpleclaw: {
                            status: COMPARE_FEATURE_STATUS.PARTIAL,
                            detailKey: 'compare.limitedLocations'
                        },
                        myclawai: {
                            status: COMPARE_FEATURE_STATUS.PARTIAL,
                            detailKey: 'compare.limitedLocations'
                        },
                        quickclaw: { status: COMPARE_FEATURE_STATUS.NO }
                    }
                },
                {
                    nameKey: 'compare.featureLocationSelection',
                    values: {
                        clawhost: { status: COMPARE_FEATURE_STATUS.YES },
                        lobsterfarm: { status: COMPARE_FEATURE_STATUS.YES },
                        simpleclaw: { status: COMPARE_FEATURE_STATUS.NO },
                        myclawai: { status: COMPARE_FEATURE_STATUS.NO },
                        quickclaw: { status: COMPARE_FEATURE_STATUS.NO }
                    }
                },
                {
                    nameKey: 'compare.featureSubdomainAccess',
                    values: {
                        clawhost: { status: COMPARE_FEATURE_STATUS.YES },
                        lobsterfarm: { status: COMPARE_FEATURE_STATUS.NO },
                        simpleclaw: { status: COMPARE_FEATURE_STATUS.NO },
                        myclawai: { status: COMPARE_FEATURE_STATUS.NO },
                        quickclaw: { status: COMPARE_FEATURE_STATUS.NO }
                    }
                }
            ]
        },
        {
            id: 'pricing',
            nameKey: 'compare.categoryPricing',
            features: [
                {
                    nameKey: 'compare.featureStartingPrice',
                    values: {
                        clawhost: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.fromTwentyFiveMonth'
                        },
                        lobsterfarm: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.nineteenMonth'
                        },
                        simpleclaw: {
                            status: COMPARE_FEATURE_STATUS.PARTIAL,
                            detailKey: 'compare.aboutFortyFourMonth'
                        },
                        myclawai: {
                            status: COMPARE_FEATURE_STATUS.PARTIAL,
                            detailKey: 'compare.fromNineteenMonth'
                        },
                        quickclaw: {
                            status: COMPARE_FEATURE_STATUS.PARTIAL,
                            detailKey: 'compare.creditBased'
                        }
                    }
                },
                {
                    nameKey: 'compare.featureTransparentPricing',
                    values: {
                        clawhost: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.clearSpecsPricing'
                        },
                        lobsterfarm: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.clearSpecsPricing'
                        },
                        simpleclaw: {
                            status: COMPARE_FEATURE_STATUS.NO,
                            detailKey: 'compare.unclearPricing'
                        },
                        myclawai: {
                            status: COMPARE_FEATURE_STATUS.PARTIAL,
                            detailKey: 'compare.fixedTiers'
                        },
                        quickclaw: {
                            status: COMPARE_FEATURE_STATUS.PARTIAL,
                            detailKey: 'compare.creditBased'
                        }
                    }
                },
                {
                    nameKey: 'compare.featurePowerfulServers',
                    values: {
                        clawhost: { status: COMPARE_FEATURE_STATUS.YES },
                        lobsterfarm: { status: COMPARE_FEATURE_STATUS.NO },
                        simpleclaw: { status: COMPARE_FEATURE_STATUS.NO },
                        myclawai: { status: COMPARE_FEATURE_STATUS.NO },
                        quickclaw: { status: COMPARE_FEATURE_STATUS.NO }
                    }
                }
            ]
        },
        {
            id: 'deployment',
            nameKey: 'compare.categoryDeployment',
            features: [
                {
                    nameKey: 'compare.featureSetupTime',
                    values: {
                        clawhost: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.minutes'
                        },
                        lobsterfarm: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.thirtySeconds'
                        },
                        simpleclaw: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.underOneMinute'
                        },
                        myclawai: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.thirtySeconds'
                        },
                        quickclaw: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.instant'
                        }
                    }
                },
                {
                    nameKey: 'compare.featureOneClickDeploy',
                    values: {
                        clawhost: { status: COMPARE_FEATURE_STATUS.YES },
                        lobsterfarm: { status: COMPARE_FEATURE_STATUS.YES },
                        simpleclaw: { status: COMPARE_FEATURE_STATUS.YES },
                        myclawai: { status: COMPARE_FEATURE_STATUS.YES },
                        quickclaw: { status: COMPARE_FEATURE_STATUS.YES }
                    }
                }
            ]
        },
        {
            id: 'management',
            nameKey: 'compare.categoryManagement',
            features: [
                {
                    nameKey: 'compare.featureMultipleInstances',
                    values: {
                        clawhost: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.unlimited'
                        },
                        lobsterfarm: {
                            status: COMPARE_FEATURE_STATUS.NO,
                            detailKey: 'compare.singleInstance'
                        },
                        simpleclaw: {
                            status: COMPARE_FEATURE_STATUS.NO,
                            detailKey: 'compare.singleInstance'
                        },
                        myclawai: {
                            status: COMPARE_FEATURE_STATUS.NO,
                            detailKey: 'compare.singleInstance'
                        },
                        quickclaw: {
                            status: COMPARE_FEATURE_STATUS.NO,
                            detailKey: 'compare.singleInstance'
                        }
                    }
                },
                {
                    nameKey: 'compare.featureOneClickVersion',
                    values: {
                        clawhost: { status: COMPARE_FEATURE_STATUS.YES },
                        lobsterfarm: { status: COMPARE_FEATURE_STATUS.NO },
                        simpleclaw: { status: COMPARE_FEATURE_STATUS.NO },
                        myclawai: { status: COMPARE_FEATURE_STATUS.NO },
                        quickclaw: { status: COMPARE_FEATURE_STATUS.NO }
                    }
                },
                {
                    nameKey: 'compare.featureWebTerminal',
                    values: {
                        clawhost: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.builtInTerminal'
                        },
                        lobsterfarm: { status: COMPARE_FEATURE_STATUS.NO },
                        simpleclaw: { status: COMPARE_FEATURE_STATUS.NO },
                        myclawai: { status: COMPARE_FEATURE_STATUS.NO },
                        quickclaw: { status: COMPARE_FEATURE_STATUS.NO }
                    }
                }
            ]
        },
        {
            id: 'security',
            nameKey: 'compare.categorySecurity',
            features: [
                {
                    nameKey: 'compare.featureDataOwnership',
                    values: {
                        clawhost: { status: COMPARE_FEATURE_STATUS.YES },
                        lobsterfarm: { status: COMPARE_FEATURE_STATUS.YES },
                        simpleclaw: { status: COMPARE_FEATURE_STATUS.NO },
                        myclawai: { status: COMPARE_FEATURE_STATUS.PARTIAL },
                        quickclaw: { status: COMPARE_FEATURE_STATUS.NO }
                    }
                },
                {
                    nameKey: 'compare.featureDataExport',
                    values: {
                        clawhost: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.zipExport'
                        },
                        lobsterfarm: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.serverTransfer'
                        },
                        simpleclaw: { status: COMPARE_FEATURE_STATUS.NO },
                        myclawai: { status: COMPARE_FEATURE_STATUS.NO },
                        quickclaw: { status: COMPARE_FEATURE_STATUS.NO }
                    }
                },
                {
                    nameKey: 'compare.featureBackups',
                    values: {
                        clawhost: { status: COMPARE_FEATURE_STATUS.NO },
                        lobsterfarm: { status: COMPARE_FEATURE_STATUS.NO },
                        simpleclaw: { status: COMPARE_FEATURE_STATUS.NO },
                        myclawai: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.dailyBackups'
                        },
                        quickclaw: { status: COMPARE_FEATURE_STATUS.NO }
                    }
                },
                {
                    nameKey: 'compare.featureSecurityHardening',
                    values: {
                        clawhost: { status: COMPARE_FEATURE_STATUS.YES },
                        lobsterfarm: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.managed'
                        },
                        simpleclaw: { status: COMPARE_FEATURE_STATUS.NO },
                        myclawai: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.managed'
                        },
                        quickclaw: { status: COMPARE_FEATURE_STATUS.NO }
                    }
                },
                {
                    nameKey: 'compare.featureSslTls',
                    values: {
                        clawhost: { status: COMPARE_FEATURE_STATUS.YES },
                        lobsterfarm: { status: COMPARE_FEATURE_STATUS.YES },
                        simpleclaw: { status: COMPARE_FEATURE_STATUS.NO },
                        myclawai: { status: COMPARE_FEATURE_STATUS.YES },
                        quickclaw: { status: COMPARE_FEATURE_STATUS.YES }
                    }
                },
                {
                    nameKey: 'compare.featureOpenSource',
                    values: {
                        clawhost: { status: COMPARE_FEATURE_STATUS.YES },
                        lobsterfarm: { status: COMPARE_FEATURE_STATUS.NO },
                        simpleclaw: { status: COMPARE_FEATURE_STATUS.NO },
                        myclawai: { status: COMPARE_FEATURE_STATUS.NO },
                        quickclaw: { status: COMPARE_FEATURE_STATUS.NO }
                    }
                }
            ]
        },
        {
            id: 'monitoring',
            nameKey: 'compare.categoryMonitoring',
            features: [
                {
                    nameKey: 'compare.featureAutoUpdates',
                    values: {
                        clawhost: { status: COMPARE_FEATURE_STATUS.YES },
                        lobsterfarm: { status: COMPARE_FEATURE_STATUS.YES },
                        simpleclaw: {
                            status: COMPARE_FEATURE_STATUS.NO,
                            detailKey: 'compare.manual'
                        },
                        myclawai: { status: COMPARE_FEATURE_STATUS.YES },
                        quickclaw: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.appStore'
                        }
                    }
                },
                {
                    nameKey: 'compare.featureDiagnostics',
                    values: {
                        clawhost: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.liveMonitoring'
                        },
                        lobsterfarm: { status: COMPARE_FEATURE_STATUS.NO },
                        simpleclaw: { status: COMPARE_FEATURE_STATUS.NO },
                        myclawai: { status: COMPARE_FEATURE_STATUS.NO },
                        quickclaw: { status: COMPARE_FEATURE_STATUS.NO }
                    }
                },
                {
                    nameKey: 'compare.featureLogStreaming',
                    values: {
                        clawhost: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.liveLogs'
                        },
                        lobsterfarm: { status: COMPARE_FEATURE_STATUS.NO },
                        simpleclaw: { status: COMPARE_FEATURE_STATUS.NO },
                        myclawai: { status: COMPARE_FEATURE_STATUS.NO },
                        quickclaw: { status: COMPARE_FEATURE_STATUS.NO }
                    }
                },
                {
                    nameKey: 'compare.featureRepairTools',
                    values: {
                        clawhost: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.oneClickRepair'
                        },
                        lobsterfarm: { status: COMPARE_FEATURE_STATUS.NO },
                        simpleclaw: { status: COMPARE_FEATURE_STATUS.NO },
                        myclawai: { status: COMPARE_FEATURE_STATUS.NO },
                        quickclaw: { status: COMPARE_FEATURE_STATUS.NO }
                    }
                }
            ]
        },
        {
            id: 'support',
            nameKey: 'compare.categorySupport',
            features: [
                {
                    nameKey: 'compare.featureSupportChannels',
                    values: {
                        clawhost: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.emailGithub'
                        },
                        lobsterfarm: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.humanSupport'
                        },
                        simpleclaw: {
                            status: COMPARE_FEATURE_STATUS.PARTIAL,
                            detailKey: 'compare.communityOnly'
                        },
                        myclawai: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.prioritySupport'
                        },
                        quickclaw: {
                            status: COMPARE_FEATURE_STATUS.PARTIAL,
                            detailKey: 'compare.appSupport'
                        }
                    }
                },
                {
                    nameKey: 'compare.featureMultiLanguage',
                    values: {
                        clawhost: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.fourLanguages'
                        },
                        lobsterfarm: {
                            status: COMPARE_FEATURE_STATUS.NO,
                            detailKey: 'compare.englishOnly'
                        },
                        simpleclaw: {
                            status: COMPARE_FEATURE_STATUS.NO,
                            detailKey: 'compare.englishOnly'
                        },
                        myclawai: {
                            status: COMPARE_FEATURE_STATUS.NO,
                            detailKey: 'compare.englishOnly'
                        },
                        quickclaw: {
                            status: COMPARE_FEATURE_STATUS.NO,
                            detailKey: 'compare.englishOnly'
                        }
                    }
                },
                {
                    nameKey: 'compare.featureThemes',
                    values: {
                        clawhost: { status: COMPARE_FEATURE_STATUS.YES },
                        lobsterfarm: { status: COMPARE_FEATURE_STATUS.NO },
                        simpleclaw: { status: COMPARE_FEATURE_STATUS.NO },
                        myclawai: { status: COMPARE_FEATURE_STATUS.NO },
                        quickclaw: { status: COMPARE_FEATURE_STATUS.NO }
                    }
                },
                {
                    nameKey: 'compare.featureMobileApp',
                    values: {
                        clawhost: {
                            status: COMPARE_FEATURE_STATUS.PARTIAL,
                            detailKey: 'compare.comingSoon'
                        },
                        lobsterfarm: { status: COMPARE_FEATURE_STATUS.NO },
                        simpleclaw: { status: COMPARE_FEATURE_STATUS.NO },
                        myclawai: { status: COMPARE_FEATURE_STATUS.NO },
                        quickclaw: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.iosMacOs'
                        }
                    }
                },
                {
                    nameKey: 'compare.featureDesktopApp',
                    values: {
                        clawhost: {
                            status: COMPARE_FEATURE_STATUS.PARTIAL,
                            detailKey: 'compare.comingSoon'
                        },
                        lobsterfarm: { status: COMPARE_FEATURE_STATUS.NO },
                        simpleclaw: { status: COMPARE_FEATURE_STATUS.NO },
                        myclawai: { status: COMPARE_FEATURE_STATUS.NO },
                        quickclaw: {
                            status: COMPARE_FEATURE_STATUS.PARTIAL,
                            detailKey: 'compare.macOsOnly'
                        }
                    }
                },
                {
                    nameKey: 'compare.featureSocials',
                    values: {
                        clawhost: {
                            status: COMPARE_FEATURE_STATUS.PARTIAL,
                            detailKey: 'compare.comingSoon'
                        },
                        lobsterfarm: { status: COMPARE_FEATURE_STATUS.NO },
                        simpleclaw: { status: COMPARE_FEATURE_STATUS.NO },
                        myclawai: { status: COMPARE_FEATURE_STATUS.NO },
                        quickclaw: { status: COMPARE_FEATURE_STATUS.NO }
                    }
                }
            ]
        }
    ]
})

export default getCompareData