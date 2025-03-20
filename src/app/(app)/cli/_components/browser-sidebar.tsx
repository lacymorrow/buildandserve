'use client'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Search } from 'lucide-react'
import { memo, useMemo } from 'react'
import type { RegistryFilters, RegistryItem } from '../_lib/types'
import { getColor } from './colors'
import { CustomInstallDialog } from './custom-install-dialog'
import type { InstallationProgress, StyleMode } from './types'
import { V0ImportDialog } from './v0-import-dialog'

export interface BrowserSidebarProps {
	currentStyle: StyleMode
	searchTerm: string
	setSearchTerm: (term: string) => void
	filters: RegistryFilters
	setFilters: (filters: RegistryFilters) => void
	categories: string[]
	types: string[]
	filteredItems: RegistryItem[]
	onCustomInstall: (command: string) => void
	installationProgress: InstallationProgress
}

export const BrowserSidebar = memo(({
	currentStyle,
	searchTerm,
	setSearchTerm,
	filters,
	setFilters,
	categories,
	types,
	filteredItems,
	onCustomInstall,
	installationProgress
}: BrowserSidebarProps) => {
	// Memoize expensive computations
	const componentCount = useMemo(() =>
		filteredItems.filter(item => item.type === 'registry:ui').length,
		[filteredItems]
	)

	const blockCount = useMemo(() =>
		filteredItems.filter(item => item.type === 'registry:block').length,
		[filteredItems]
	)

	const categoryCount = useMemo(() =>
		categories.reduce((acc, category) => {
			acc[category] = filteredItems.filter(item => item.categories?.includes(category)).length
			return acc
		}, {} as Record<string, number>),
		[categories, filteredItems]
	)

	return (
		<div className={cn(
			"w-full md:w-72 border-r border-border p-4 flex flex-col",
			currentStyle === 'brutalist' && "border-r-2 border-primary"
		)}>
			<div className="space-y-6">
				<div>
					<div className="flex items-center justify-between mb-2">
						<Label htmlFor="search" className="text-sm font-medium">
							Search
						</Label>
						<Badge variant="secondary" className="font-mono">
							{filteredItems.length} results
						</Badge>
					</div>
					<div className="relative">
						<Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
						<Input
							id="search"
							placeholder="Search components..."
							className={cn(
								"pl-8",
								currentStyle === 'brutalist'
									? 'border-2 border-primary rounded-none'
									: 'border rounded-md'
							)}
							value={searchTerm}
							onChange={(e) => {
								setSearchTerm(e.target.value)
								// Reset filters when searching to show all results
								setFilters({
									...filters,
									type: 'all',
									category: 'all'
								})
							}}
						/>
					</div>
				</div>

				<div className="space-y-2">
					<CustomInstallDialog
						onInstall={onCustomInstall}
						installationProgress={installationProgress}
					/>

					<V0ImportDialog
						onInstall={onCustomInstall}
						installationProgress={installationProgress}
					/>
				</div>

				<div>
					<Label htmlFor="type-select" className="text-sm font-medium block mb-2">Type</Label>
					<Select
						value={filters.type || 'all'}
						onValueChange={(value) => setFilters({ ...filters, type: value as RegistryFilters['type'] })}
					>
						<SelectTrigger id="type-select" className={cn(
							currentStyle === 'brutalist'
								? 'border-2 border-primary rounded-none'
								: 'border rounded-md'
						)}>
							<SelectValue placeholder="All Types" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Types</SelectItem>
							<SelectItem value="components">Components ({componentCount})</SelectItem>
							<SelectItem value="blocks">Blocks ({blockCount})</SelectItem>
						</SelectContent>
					</Select>
				</div>

				<div>
					<Label htmlFor="category-select" className="text-sm font-medium block mb-2">Category</Label>
					<Select
						value={filters.category || 'all'}
						onValueChange={(value) => setFilters({ ...filters, category: value })}
					>
						<SelectTrigger id="category-select" className={cn(
							currentStyle === 'brutalist'
								? 'border-2 border-primary rounded-none'
								: 'border rounded-md'
						)}>
							<SelectValue placeholder="All Categories" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Categories</SelectItem>
							{categories.map((category) => (
								<SelectItem key={category} value={category}>
									<div className="flex items-center justify-between w-full">
										<div className="flex items-center">
											<div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: getColor(category) }} />
											{category}
										</div>
										<span className="ml-auto text-xs text-muted-foreground">
											{categoryCount[category]}
										</span>
									</div>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
		</div>
	)
})
BrowserSidebar.displayName = 'BrowserSidebar'

