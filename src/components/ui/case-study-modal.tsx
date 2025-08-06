"use client";

import Image from "next/image";
import { Link } from "@/components/primitives/link-with-transition";
import { ExternalLink, Calendar, Users, ArrowRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CaseStudyModalProps {
  title: string;
  description: string;
  image: string;
  technologies: string[];
  duration?: string;
  scale?: string;
  role?: string;
  externalUrl?: string;
  caseStudyUrl: string;
  highlights?: string[];
  icon?: React.ReactNode;
}

export const CaseStudyModal = ({
  title,
  description,
  image,
  technologies,
  duration,
  scale,
  role,
  externalUrl,
  caseStudyUrl,
  highlights = [],
  icon,
}: CaseStudyModalProps) => {
  return (
    <div className="space-y-4 p-4 max-w-4xl mx-auto max-h-[80vh] overflow-y-auto">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          {icon}
          <h2 className="text-3xl font-bold">{title}</h2>
        </div>

        <p className="text-muted-foreground leading-relaxed">{description}</p>

        <div className="flex flex-wrap gap-2">
          {technologies.map((tech) => (
            <Badge key={tech} variant="secondary">
              {tech}
            </Badge>
          ))}
        </div>
      </div>

      {/* Metrics */}
      {(duration || scale || role) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-3 border-y">
          {duration && (
            <div className="text-center">
              <Calendar className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <div className="text-lg font-semibold">{duration}</div>
              <div className="text-xs text-muted-foreground">Duration</div>
            </div>
          )}
          {scale && (
            <div className="text-center">
              <Users className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <div className="text-lg font-semibold">{scale}</div>
              <div className="text-xs text-muted-foreground">Scale</div>
            </div>
          )}
          {role && (
            <div className="text-center">
              <div className="h-5 w-5 mx-auto mb-1 bg-primary/20 rounded-full" />
              <div className="text-lg font-semibold">{role}</div>
              <div className="text-xs text-muted-foreground">Role</div>
            </div>
          )}
        </div>
      )}

      {/* Main Image */}
      <div className="space-y-2">
        <Image
          src={image}
          alt={title}
          width={800}
          height={500}
          className="w-full h-auto max-h-[300px] object-contain rounded-lg shadow-md bg-muted/20"
          priority
        />
      </div>

      {/* Highlights */}
      {highlights.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Key Highlights</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {highlights.map((highlight, index) => (
              <div key={index} className="flex items-start gap-2 text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                <span className="text-muted-foreground">{highlight}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <button
          onClick={() => (window.location.href = caseStudyUrl)}
          className={cn(buttonVariants(), "flex-1")}
        >
          <ArrowRight className="h-4 w-4 mr-2" />
          View Full Case Study
        </button>
        {externalUrl && (
          <Button variant="outline" asChild className="flex-1">
            <Link href={externalUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              Visit Project
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
};
