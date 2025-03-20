'use client'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/hooks/use-toast'
import { ReloadIcon } from '@radix-ui/react-icons'
import { saveAs } from 'file-saver'
import JSZip from 'jszip'
import { FileDown, SparklesIcon } from 'lucide-react'
import { type FormEvent, memo, useCallback, useEffect, useState } from 'react'
import { fetchV0ComponentStructure, importV0Component } from '../_actions/import-v0'
import type { InstallationProgress } from './types'

interface V0ImportDialogProps {
    onInstall?: (command: string) => void
    installationProgress: InstallationProgress
}

interface StructureFile {
    path: string
    content: string
}

export const V0ImportDialog = memo(({ onInstall, installationProgress }: V0ImportDialogProps) => {
    const [open, setOpen] = useState(false)
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [componentStructure, setComponentStructure] = useState<{
        files: StructureFile[]
        appStructure: 'app' | 'src/app' | null
    } | null>(null)
    const [targetStructure, setTargetStructure] = useState<'app' | 'src/app'>('src/app')
    const [adjustPaths, setAdjustPaths] = useState(true)
    const [downloadProgress, setDownloadProgress] = useState(0)

    // Reset component structure when dialog closes
    useEffect(() => {
        if (!open) {
            setComponentStructure(null)
            setDownloadProgress(0)
        }
    }, [open])

    const handleFetchStructure = useCallback(async (e: FormEvent) => {
        e.preventDefault()
        if (!input.trim()) return

        setLoading(true)

        try {
            const trimmedInput = input.trim()

            // First, fetch the component structure
            const structure = await fetchV0ComponentStructure(trimmedInput)
            setComponentStructure(structure)

            toast({
                title: "Component structure fetched",
                description: `Found ${structure.files.length} files in ${structure.appStructure || 'custom'} structure`,
            })
        } catch (error) {
            toast({
                title: "Error fetching component",
                description: error instanceof Error ? error.message : "Failed to fetch component structure",
                variant: "destructive",
            })
        } finally {
            setLoading(false)
        }
    }, [input])

    const handleInstall = useCallback(async () => {
        if (!componentStructure) return

        setOpen(false)
        setInput('')

        // If we have an onInstall handler, let the parent component handle the installation
        if (onInstall) {
            const options = adjustPaths && componentStructure.appStructure !== targetStructure
                ? `--path ${targetStructure.replace('/', '-')}`
                : ''

            const command = `npx shadcn@latest add "${input.trim()}" ${options}`
            onInstall(command)
            return
        }

        toast({
            title: "Component imported",
            description: "You can now install the component files manually",
        })
    }, [input, componentStructure, onInstall, adjustPaths, targetStructure])

    const handleDownload = useCallback(async () => {
        if (!componentStructure) return

        try {
            setDownloadProgress(10)

            // If we need to adjust paths and the structures don't match, import with adjustments
            let files = componentStructure.files

            if (adjustPaths && componentStructure.appStructure && componentStructure.appStructure !== targetStructure) {
                const result = await importV0Component(input.trim(), { targetStructure })
                files = result.files
                setDownloadProgress(40)
            }

            // Create a zip file with the component files
            const zip = new JSZip()

            // Add files to the zip
            for (const file of files) {
                zip.file(file.path, file.content)
            }

            setDownloadProgress(70)

            // Generate the zip file
            const content = await zip.generateAsync({ type: 'blob' })

            setDownloadProgress(90)

            // Save the zip file
            const componentName = input.trim().split('/').pop() || 'v0-component'
            saveAs(content, `${componentName}.zip`)

            setDownloadProgress(100)

            toast({
                title: "Component downloaded",
                description: "You can now extract and install the files manually",
            })

            setTimeout(() => {
                setOpen(false)
                setInput('')
                setDownloadProgress(0)
            }, 1000)
        } catch (error) {
            toast({
                title: "Error downloading component",
                description: error instanceof Error ? error.message : "Failed to download component files",
                variant: "destructive",
            })
            setDownloadProgress(0)
        }
    }, [componentStructure, input, adjustPaths, targetStructure])

    const handleOpenChange = useCallback((isOpen: boolean) => {
        if (!loading || !isOpen) {
            setOpen(isOpen)
        }
    }, [loading])

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="default"
                    className="w-full justify-start"
                    onClick={(e) => {
                        e.stopPropagation()
                        setOpen(true)
                    }}
                >
                    <SparklesIcon className="mr-2 h-4 w-4" />
                    Import from v0.dev
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[500px] p-4"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="space-y-4">
                    <div className="space-y-2">
                        <h4 className="font-medium leading-none">Import v0.dev Component</h4>
                        <p className="text-sm text-muted-foreground">
                            Enter a v0.dev component URL to import it safely
                        </p>
                    </div>

                    {!componentStructure ? (
                        <form onSubmit={handleFetchStructure} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="v0-input">v0.dev URL</Label>
                                <Input
                                    id="v0-input"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="https://v0.dev/chat/b/..."
                                    required
                                    disabled={loading}
                                />
                                <div className="text-xs text-muted-foreground space-y-1">
                                    <p>Enter a v0.dev component URL</p>
                                </div>
                            </div>
                            <div className="flex justify-end">
                                <Button type="submit" disabled={loading}>
                                    {loading ? (
                                        <>
                                            <ReloadIcon className="mr-2 h-4 w-4 animate-spin" />
                                            Fetching...
                                        </>
                                    ) : (
                                        'Fetch Structure'
                                    )}
                                </Button>
                            </div>
                        </form>
                    ) : (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <h4 className="text-sm font-medium">Component Structure</h4>
                                <div className="flex items-center justify-between text-sm">
                                    <span>
                                        Found {componentStructure.files.length} files
                                        {componentStructure.appStructure && (
                                            <span className="text-muted-foreground"> in {componentStructure.appStructure} structure</span>
                                        )}
                                    </span>
                                    <Button variant="outline" size="sm" onClick={() => setComponentStructure(null)}>
                                        Back
                                    </Button>
                                </div>
                            </div>

                            <div className="border rounded-md p-4 space-y-3">
                                <div className="space-y-1">
                                    <Label htmlFor="target-structure">Your Project Structure</Label>
                                    <Select
                                        value={targetStructure}
                                        onValueChange={(val) => setTargetStructure(val as 'app' | 'src/app')}
                                    >
                                        <SelectTrigger id="target-structure">
                                            <SelectValue placeholder="Select structure" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="app">app directory (Next.js 13+)</SelectItem>
                                            <SelectItem value="src/app">src/app directory (Next.js 13+ with src)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="adjust-paths"
                                        checked={adjustPaths}
                                        onCheckedChange={(checked) => setAdjustPaths(checked === true)}
                                    />
                                    <Label htmlFor="adjust-paths" className="text-sm">
                                        Adjust paths to match my project structure
                                    </Label>
                                </div>
                            </div>

                            <Tabs defaultValue="download" className="w-full">
                                <TabsList className="grid w-full grid-cols-2">
                                    <TabsTrigger value="download">Download Files</TabsTrigger>
                                    <TabsTrigger value="install">Import + Install</TabsTrigger>
                                </TabsList>
                                <TabsContent value="download" className="space-y-4 pt-2">
                                    <div className="text-sm text-muted-foreground">
                                        <p>Download the component files as a ZIP archive that you can extract and install manually.</p>
                                    </div>

                                    {downloadProgress > 0 && downloadProgress < 100 ? (
                                        <div className="space-y-2">
                                            <Progress value={downloadProgress} className="w-full" />
                                            <p className="text-xs text-center text-muted-foreground">Preparing download ({downloadProgress}%)</p>
                                        </div>
                                    ) : (
                                        <Button onClick={handleDownload} className="w-full">
                                            <FileDown className="mr-2 h-4 w-4" />
                                            Download Component Files
                                        </Button>
                                    )}
                                </TabsContent>
                                <TabsContent value="install" className="space-y-4 pt-2">
                                    <div className="text-sm text-muted-foreground">
                                        <p>Import and install the component directly into your project. This only works in a development environment.</p>
                                    </div>
                                    <Button onClick={handleInstall} variant="default" className="w-full">
                                        <SparklesIcon className="mr-2 h-4 w-4" />
                                        Import and Install
                                    </Button>
                                </TabsContent>
                            </Tabs>
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
})

V0ImportDialog.displayName = 'V0ImportDialog'
