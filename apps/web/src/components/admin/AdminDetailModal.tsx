import type { FC, ReactNode } from 'react'
import type {
    AdminDetailModalProps,
    AdminClawListItem,
    AdminSSHKeyListItem,
    AdminVolumeListItem,
    AdminPendingClawListItem,
    AdminReferralListItem,
    AdminExportListItem,
    AdminEmailListItem,
    BillingOrder
} from '@/ts/Interfaces'

import { Dialog, DialogContent } from '@/components/ui'
import AdminClawDetailView from '@/components/admin/AdminClawDetailView'
import AdminSSHKeyDetailView from '@/components/admin/AdminSSHKeyDetailView'
import AdminVolumeDetailView from '@/components/admin/AdminVolumeDetailView'
import AdminPendingClawDetailView from '@/components/admin/AdminPendingClawDetailView'
import AdminReferralDetailView from '@/components/admin/AdminReferralDetailView'
import AdminExportDetailView from '@/components/admin/AdminExportDetailView'
import AdminEmailDetailView from '@/components/admin/AdminEmailDetailView'
import AdminBillingDetailView from '@/components/admin/AdminBillingDetailView'
import AdminUserDetailView from '@/components/admin/AdminUserDetailView'

const AdminDetailModal: FC<AdminDetailModalProps> = ({
    entity,
    onClose,
    onNavigateToUser
}): ReactNode => {
    const renderEntityContent = () => {
        if (!entity) return null

        switch (entity.type) {
            case 'user':
                return (
                    <AdminUserDetailView userId={entity.id} onClose={onClose} />
                )
            case 'claw':
                return (
                    <AdminClawDetailView
                        claw={entity.data as AdminClawListItem}
                        onClose={onClose}
                        onNavigateToUser={onNavigateToUser}
                    />
                )
            case 'ssh-key':
                return (
                    <AdminSSHKeyDetailView
                        sshKey={entity.data as AdminSSHKeyListItem}
                        onClose={onClose}
                        onNavigateToUser={onNavigateToUser}
                    />
                )
            case 'volume':
                return (
                    <AdminVolumeDetailView
                        volume={entity.data as AdminVolumeListItem}
                        onClose={onClose}
                        onNavigateToUser={onNavigateToUser}
                    />
                )
            case 'pending-claw':
                return (
                    <AdminPendingClawDetailView
                        pendingClaw={entity.data as AdminPendingClawListItem}
                        onClose={onClose}
                        onNavigateToUser={onNavigateToUser}
                    />
                )
            case 'referral':
                return (
                    <AdminReferralDetailView
                        referral={entity.data as AdminReferralListItem}
                        onClose={onClose}
                        onNavigateToUser={onNavigateToUser}
                    />
                )
            case 'export':
                return (
                    <AdminExportDetailView
                        exportItem={entity.data as AdminExportListItem}
                        onClose={onClose}
                        onNavigateToUser={onNavigateToUser}
                    />
                )
            case 'email':
                return (
                    <AdminEmailDetailView
                        email={entity.data as AdminEmailListItem}
                        onClose={onClose}
                        onNavigateToUser={onNavigateToUser}
                    />
                )
            case 'billing':
                return (
                    <AdminBillingDetailView
                        order={entity.data as BillingOrder}
                        onClose={onClose}
                    />
                )
            default:
                return null
        }
    }

    return (
        <Dialog open={!!entity} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className='max-h-[85vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto'>
                {renderEntityContent()}
            </DialogContent>
        </Dialog>
    )
}

export default AdminDetailModal