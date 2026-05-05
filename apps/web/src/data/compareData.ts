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
            id: 'simpleagent',
            nameKey: 'compare.competitorSimpleAgent',
            highlighted: false
        },
        {
            id: 'myagentai',
            nameKey: 'compare.competitorMyAgentAi',
            highlighted: false
        },
        {
            id: 'quickagent',
            nameKey: 'compare.competitorQuickAgent',
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
                        simpleagent: {
                            status: COMPARE_FEATURE_STATUS.PARTIAL,
                            detailKey: 'compare.sharedContainers'
                        },
                        myagentai: {
                            status: COMPARE_FEATURE_STATUS.PARTIAL,
                            detailKey: 'compare.isolatedContainers'
                        },
                        quickagent: {
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
                        simpleagent: {
                            status: COMPARE_FEATURE_STATUS.NO,
                            detailKey: 'compare.singleProvider'
                        },
                        myagentai: {
                            status: COMPARE_FEATURE_STATUS.NO,
                            detailKey: 'compare.singleProvider'
                        },
                        quickagent: {
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
                        simpleagent: {
                            status: COMPARE_FEATURE_STATUS.NO,
                            detailKey: 'compare.shared'
                        },
                        myagentai: {
                            status: COMPARE_FEATURE_STATUS.NO,
                            detailKey: 'compare.shared'
                        },
                        quickagent: {
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
                        simpleagent: { status: COMPARE_FEATURE_STATUS.NO },
                        myagentai: { status: COMPARE_FEATURE_STATUS.NO },
                        quickagent: { status: COMPARE_FEATURE_STATUS.NO }
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
                        simpleagent: {
                            status: COMPARE_FEATURE_STATUS.PARTIAL,
                            detailKey: 'compare.limitedLocations'
                        },
                        myagentai: {
                            status: COMPARE_FEATURE_STATUS.PARTIAL,
                            detailKey: 'compare.limitedLocations'
                        },
                        quickagent: { status: COMPARE_FEATURE_STATUS.NO }
                    }
                },
                {
                    nameKey: 'compare.featureLocationSelection',
                    values: {
                        clawhost: { status: COMPARE_FEATURE_STATUS.YES },
                        lobsterfarm: { status: COMPARE_FEATURE_STATUS.YES },
                        simpleagent: { status: COMPARE_FEATURE_STATUS.NO },
                        myagentai: { status: COMPARE_FEATURE_STATUS.NO },
                        quickagent: { status: COMPARE_FEATURE_STATUS.NO }
                    }
                },
                {
                    nameKey: 'compare.featureSubdomainAccess',
                    values: {
                        clawhost: { status: COMPARE_FEATURE_STATUS.YES },
                        lobsterfarm: { status: COMPARE_FEATURE_STATUS.NO },
                        simpleagent: { status: COMPARE_FEATURE_STATUS.NO },
                        myagentai: { status: COMPARE_FEATURE_STATUS.NO },
                        quickagent: { status: COMPARE_FEATURE_STATUS.NO }
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
                        simpleagent: {
                            status: COMPARE_FEATURE_STATUS.PARTIAL,
                            detailKey: 'compare.aboutFortyFourMonth'
                        },
                        myagentai: {
                            status: COMPARE_FEATURE_STATUS.PARTIAL,
                            detailKey: 'compare.fromNineteenMonth'
                        },
                        quickagent: {
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
                        simpleagent: {
                            status: COMPARE_FEATURE_STATUS.NO,
                            detailKey: 'compare.unclearPricing'
                        },
                        myagentai: {
                            status: COMPARE_FEATURE_STATUS.PARTIAL,
                            detailKey: 'compare.fixedTiers'
                        },
                        quickagent: {
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
                        simpleagent: { status: COMPARE_FEATURE_STATUS.NO },
                        myagentai: { status: COMPARE_FEATURE_STATUS.NO },
                        quickagent: { status: COMPARE_FEATURE_STATUS.NO }
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
                        simpleagent: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.underOneMinute'
                        },
                        myagentai: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.thirtySeconds'
                        },
                        quickagent: {
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
                        simpleagent: { status: COMPARE_FEATURE_STATUS.YES },
                        myagentai: { status: COMPARE_FEATURE_STATUS.YES },
                        quickagent: { status: COMPARE_FEATURE_STATUS.YES }
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
                        simpleagent: {
                            status: COMPARE_FEATURE_STATUS.NO,
                            detailKey: 'compare.singleInstance'
                        },
                        myagentai: {
                            status: COMPARE_FEATURE_STATUS.NO,
                            detailKey: 'compare.singleInstance'
                        },
                        quickagent: {
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
                        simpleagent: { status: COMPARE_FEATURE_STATUS.NO },
                        myagentai: { status: COMPARE_FEATURE_STATUS.NO },
                        quickagent: { status: COMPARE_FEATURE_STATUS.NO }
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
                        simpleagent: { status: COMPARE_FEATURE_STATUS.NO },
                        myagentai: { status: COMPARE_FEATURE_STATUS.NO },
                        quickagent: { status: COMPARE_FEATURE_STATUS.NO }
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
                        simpleagent: { status: COMPARE_FEATURE_STATUS.NO },
                        myagentai: { status: COMPARE_FEATURE_STATUS.PARTIAL },
                        quickagent: { status: COMPARE_FEATURE_STATUS.NO }
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
                        simpleagent: { status: COMPARE_FEATURE_STATUS.NO },
                        myagentai: { status: COMPARE_FEATURE_STATUS.NO },
                        quickagent: { status: COMPARE_FEATURE_STATUS.NO }
                    }
                },
                {
                    nameKey: 'compare.featureBackups',
                    values: {
                        clawhost: { status: COMPARE_FEATURE_STATUS.NO },
                        lobsterfarm: { status: COMPARE_FEATURE_STATUS.NO },
                        simpleagent: { status: COMPARE_FEATURE_STATUS.NO },
                        myagentai: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.dailyBackups'
                        },
                        quickagent: { status: COMPARE_FEATURE_STATUS.NO }
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
                        simpleagent: { status: COMPARE_FEATURE_STATUS.NO },
                        myagentai: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.managed'
                        },
                        quickagent: { status: COMPARE_FEATURE_STATUS.NO }
                    }
                },
                {
                    nameKey: 'compare.featureSslTls',
                    values: {
                        clawhost: { status: COMPARE_FEATURE_STATUS.YES },
                        lobsterfarm: { status: COMPARE_FEATURE_STATUS.YES },
                        simpleagent: { status: COMPARE_FEATURE_STATUS.NO },
                        myagentai: { status: COMPARE_FEATURE_STATUS.YES },
                        quickagent: { status: COMPARE_FEATURE_STATUS.YES }
                    }
                },
                {
                    nameKey: 'compare.featureOpenSource',
                    values: {
                        clawhost: { status: COMPARE_FEATURE_STATUS.YES },
                        lobsterfarm: { status: COMPARE_FEATURE_STATUS.NO },
                        simpleagent: { status: COMPARE_FEATURE_STATUS.NO },
                        myagentai: { status: COMPARE_FEATURE_STATUS.NO },
                        quickagent: { status: COMPARE_FEATURE_STATUS.NO }
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
                        simpleagent: {
                            status: COMPARE_FEATURE_STATUS.NO,
                            detailKey: 'compare.manual'
                        },
                        myagentai: { status: COMPARE_FEATURE_STATUS.YES },
                        quickagent: {
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
                        simpleagent: { status: COMPARE_FEATURE_STATUS.NO },
                        myagentai: { status: COMPARE_FEATURE_STATUS.NO },
                        quickagent: { status: COMPARE_FEATURE_STATUS.NO }
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
                        simpleagent: { status: COMPARE_FEATURE_STATUS.NO },
                        myagentai: { status: COMPARE_FEATURE_STATUS.NO },
                        quickagent: { status: COMPARE_FEATURE_STATUS.NO }
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
                        simpleagent: { status: COMPARE_FEATURE_STATUS.NO },
                        myagentai: { status: COMPARE_FEATURE_STATUS.NO },
                        quickagent: { status: COMPARE_FEATURE_STATUS.NO }
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
                        simpleagent: {
                            status: COMPARE_FEATURE_STATUS.PARTIAL,
                            detailKey: 'compare.communityOnly'
                        },
                        myagentai: {
                            status: COMPARE_FEATURE_STATUS.YES,
                            detailKey: 'compare.prioritySupport'
                        },
                        quickagent: {
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
                        simpleagent: {
                            status: COMPARE_FEATURE_STATUS.NO,
                            detailKey: 'compare.englishOnly'
                        },
                        myagentai: {
                            status: COMPARE_FEATURE_STATUS.NO,
                            detailKey: 'compare.englishOnly'
                        },
                        quickagent: {
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
                        simpleagent: { status: COMPARE_FEATURE_STATUS.NO },
                        myagentai: { status: COMPARE_FEATURE_STATUS.NO },
                        quickagent: { status: COMPARE_FEATURE_STATUS.NO }
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
                        simpleagent: { status: COMPARE_FEATURE_STATUS.NO },
                        myagentai: { status: COMPARE_FEATURE_STATUS.NO },
                        quickagent: {
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
                        simpleagent: { status: COMPARE_FEATURE_STATUS.NO },
                        myagentai: { status: COMPARE_FEATURE_STATUS.NO },
                        quickagent: { status: COMPARE_FEATURE_STATUS.NO }
                    }
                }
            ]
        }
    ]
})

export default getCompareData