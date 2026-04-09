import type {
    BundledSkillInfo,
    ClawSkillsResponse,
    GetAgentSkillsResponse,
    SkillEntryConfig,
    UseBundledSkillsParams,
    UseBundledSkillsReturn
} from '@/ts/Interfaces'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { t } from '@openclaw/i18n'
import { api } from '@/lib'
import { useUIStore, useSkillsStore } from '@/lib/store'
import { TOAST_TYPE } from '@/lib/constants'

const useBundledSkills = (
    params: UseBundledSkillsParams
): UseBundledSkillsReturn => {
    const { clawId, agentId, isAgentMode, search } = params
    const [skills, setSkills] = useState<BundledSkillInfo[]>([])
    const [entries, setEntries] = useState<Record<string, SkillEntryConfig>>({})
    const { pendingSkill, setPendingSkill } = useSkillsStore()
    const { showToast } = useUIStore()
    const queryClient = useQueryClient()

    const clawQueryKey = ['claw-skills', clawId]
    const agentQueryKey = ['agent-skills', clawId, agentId]

    const { data: clawSkillsData, isLoading: isClawSkillsLoading } = useQuery({
        queryKey: clawQueryKey,
        queryFn: () => api.getClawSkills(clawId),
        staleTime: 0,
        gcTime: 0,
        retry: 1
    })

    const { data: agentSkillsData, isLoading: isAgentSkillsLoading } = useQuery(
        {
            queryKey: agentQueryKey,
            queryFn: () => api.getAgentSkills(clawId, agentId!),
            enabled: isAgentMode,
            staleTime: 0,
            gcTime: 0,
            retry: 1
        }
    )

    const isBundledLoading =
        isClawSkillsLoading || (isAgentMode && isAgentSkillsLoading)

    useEffect(() => {
        if (clawSkillsData && !isAgentMode) {
            setSkills(clawSkillsData.skills || [])
            setEntries(clawSkillsData.entries || {})
        }
    }, [clawSkillsData, isAgentMode])

    const installedSet = useMemo(() => {
        const set = new Set<string>()
        agentSkillsData?.skills?.forEach((s) => set.add(s.name))
        return set
    }, [agentSkillsData])

    const skillsList = useMemo(
        () => clawSkillsData?.skills || [],
        [clawSkillsData]
    )

    const displaySkills = isAgentMode ? skillsList : skills

    const filteredBundledSkills = useMemo(() => {
        if (!search.trim()) return displaySkills
        const q = search.toLowerCase()
        return displaySkills.filter(
            (s) =>
                s.name.toLowerCase().includes(q) ||
                (s.description && s.description.toLowerCase().includes(q))
        )
    }, [displaySkills, search])

    const clawToggleMutation = useMutation({
        mutationFn: (name: string) => {
            const updatedSkills = skills.map((s) =>
                s.name === name ? { ...s, enabled: !s.enabled } : s
            )
            const updatedEntries: Record<string, SkillEntryConfig> = {}
            for (const skill of updatedSkills) {
                updatedEntries[skill.name] = {
                    ...entries[skill.name],
                    enabled: skill.enabled
                }
            }
            return api.updateClawSkills(clawId, { entries: updatedEntries })
        },
        onMutate: (name: string) => {
            setPendingSkill(name)
            setSkills((prev) =>
                prev.map((s) =>
                    s.name === name ? { ...s, enabled: !s.enabled } : s
                )
            )
            setEntries((prev) => {
                const current = prev[name] || { enabled: true }
                return {
                    ...prev,
                    [name]: { ...current, enabled: !current.enabled }
                }
            })
        },
        onSuccess: () => {
            setPendingSkill(null)
            queryClient.setQueryData<ClawSkillsResponse>(clawQueryKey, {
                skills,
                entries
            })
        },
        onError: (_: unknown, name: string) => {
            showToast(t('playground.skillsSaveFailed'), TOAST_TYPE.ERROR)
            setPendingSkill(null)
            setSkills((prev) =>
                prev.map((s) =>
                    s.name === name ? { ...s, enabled: !s.enabled } : s
                )
            )
            setEntries((prev) => {
                const current = prev[name] || { enabled: true }
                return {
                    ...prev,
                    [name]: { ...current, enabled: !current.enabled }
                }
            })
        }
    })

    const installMutation = useMutation({
        mutationFn: (name: string) =>
            api.updateAgentSkills(clawId, agentId!, {
                action: 'install',
                skillName: name
            }),
        onSuccess: (_: void, name: string) => {
            showToast(t('playground.agentSkillsInstalled'), TOAST_TYPE.SUCCESS)
            setPendingSkill(null)
            queryClient.setQueryData<GetAgentSkillsResponse>(
                agentQueryKey,
                (old) => {
                    if (!old) return { skills: [{ name }] }
                    if (old.skills.some((s) => s.name === name)) return old
                    return { skills: [...old.skills, { name }] }
                }
            )
        },
        onError: () => {
            showToast(
                t('playground.agentSkillsInstallFailed'),
                TOAST_TYPE.ERROR
            )
            setPendingSkill(null)
        }
    })

    const removeMutation = useMutation({
        mutationFn: (name: string) =>
            api.updateAgentSkills(clawId, agentId!, {
                action: 'remove',
                skillName: name
            }),
        onSuccess: (_: void, name: string) => {
            showToast(t('playground.agentSkillsRemoved'), TOAST_TYPE.SUCCESS)
            setPendingSkill(null)
            queryClient.setQueryData<GetAgentSkillsResponse>(
                agentQueryKey,
                (old) => {
                    if (!old) return { skills: [] }
                    return { skills: old.skills.filter((s) => s.name !== name) }
                }
            )
        },
        onError: () => {
            showToast(t('playground.agentSkillsRemoveFailed'), TOAST_TYPE.ERROR)
            setPendingSkill(null)
        }
    })

    const handleBundledAction = useCallback(
        (name: string) => {
            if (pendingSkill) return
            if (isAgentMode) {
                setPendingSkill(name)
                if (installedSet.has(name)) {
                    removeMutation.mutate(name)
                } else {
                    installMutation.mutate(name)
                }
            } else {
                clawToggleMutation.mutate(name)
            }
        },
        [
            isAgentMode,
            pendingSkill,
            installedSet,
            removeMutation,
            installMutation,
            clawToggleMutation,
            setPendingSkill
        ]
    )

    const isBundledActive = useCallback(
        (skill: BundledSkillInfo) => {
            if (isAgentMode) return installedSet.has(skill.name)
            return skill.enabled
        },
        [isAgentMode, installedSet]
    )

    return {
        filteredBundledSkills,
        isBundledActive,
        handleBundledAction,
        isBundledLoading: !!isBundledLoading,
        installedSet
    }
}

export default useBundledSkills