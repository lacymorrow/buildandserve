'use client'

import { checkIsAdmin } from '@/server/actions/admin-actions'
import { useEffect, useState } from 'react'

/**
 * Props for the AdminOnly component
 */
interface AdminOnlyProps {
    children: React.ReactNode
    email?: string | null
    fallback?: React.ReactNode
}

/**
 * AdminOnly component that only renders its children if the user is an admin
 * Uses server-side admin checking for security
 *
 * @example
 * ```tsx
 * <AdminOnly email={session?.user?.email}>
 *   <AdminPanel />
 * </AdminOnly>
 * ```
 */
export const AdminOnly = ({
    children,
    email,
    fallback = null
}: AdminOnlyProps) => {
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

    if (isLoading) {
        // You could return a loading indicator here
        return null
    }

    return isAdmin ? children : fallback
}

/**
 * Hook to check if a user is an admin
 *
 * @example
 * ```tsx
 * const { isAdmin, isLoading } = useAdminCheck(session?.user?.email)
 *
 * if (isLoading) return <LoadingSpinner />
 * if (!isAdmin) return <AccessDenied />
 *
 * return <AdminDashboard />
 * ```
 */
export const useAdminCheck = (email?: string | null) => {
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
