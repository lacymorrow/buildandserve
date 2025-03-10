'use client'

import { checkIsAdmin } from '@/server/actions/admin-actions'
import { useEffect, useState } from 'react'

/**
 * Hook to check if a user is an admin
 *
 * @example
 * ```tsx
 * const { isAdmin, isLoading } = useIsAdmin(session?.user?.email)
 *
 * if (isLoading) return <LoadingSpinner />
 * if (!isAdmin) return <AccessDenied />
 *
 * return <AdminDashboard />
 * ```
 */
export const useIsAdmin = (email?: string | null) => {
    const [isAdmin, setIsAdmin] = useState(false)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const checkAdmin = async () => {
            if (!email) {
                setIsAdmin(false)
                setIsLoading(false)
                return
            }

            try {
                const result = await checkIsAdmin(email)
                setIsAdmin(result)
            } catch (error) {
                console.error('Error checking admin status:', error)
                setIsAdmin(false)
            } finally {
                setIsLoading(false)
            }
        }

        checkAdmin()
    }, [email])

    return { isAdmin, isLoading }
}
