import { Check, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PublicBottomCta, PublicPageHero, PublicShell } from "../components/public-shell";
import { PublicSection } from "../components/public-ui";
import { cn } from "@/lib/utils";

export function PricingPage() {
  const { t } = useTranslation();

  const plans = [
    {
      key: "free",
      name: t("pricing.plans.free.name"),
      price: t("pricing.plans.free.price"),
      description: t("pricing.plans.free.description"),
      features: [
        t("pricing.plans.free.features.0"),
        t("pricing.plans.free.features.1"),
        t("pricing.plans.free.features.2"),
        t("pricing.plans.free.features.3"),
      ],
      cta: t("pricing.plans.free.cta"),
      ctaHref: "https://github.com",
      highlighted: false,
    },
    {
      key: "pro",
      name: t("pricing.plans.pro.name"),
      price: t("pricing.plans.pro.price"),
      priceUnit: t("pricing.plans.pro.priceUnit"),
      description: t("pricing.plans.pro.description"),
      features: [
        t("pricing.plans.pro.features.0"),
        t("pricing.plans.pro.features.1"),
        t("pricing.plans.pro.features.2"),
        t("pricing.plans.pro.features.3"),
        t("pricing.plans.pro.features.4"),
      ],
      cta: t("pricing.plans.pro.cta"),
      ctaHref: "/docs",
      highlighted: true,
    },
    {
      key: "enterprise",
      name: t("pricing.plans.enterprise.name"),
      price: t("pricing.plans.enterprise.price"),
      description: t("pricing.plans.enterprise.description"),
      features: [
        t("pricing.plans.enterprise.features.0"),
        t("pricing.plans.enterprise.features.1"),
        t("pricing.plans.enterprise.features.2"),
        t("pricing.plans.enterprise.features.3"),
        t("pricing.plans.enterprise.features.4"),
      ],
      cta: t("pricing.plans.enterprise.cta"),
      ctaHref: "mailto:support@shiromail.dev",
      highlighted: false,
    },
  ];

  return (
    <PublicShell>
      <PublicPageHero
        eyebrow={t("pricing.eyebrow")}
        title={t("pricing.title")}
        description={t("pricing.description")}
      />

      <PublicSection title={t("pricing.sectionTitle")} description={t("pricing.sectionDescription")}>
        <div className="grid gap-5 md:grid-cols-3">
          {plans.map((plan) => (
            <Card
              key={plan.key}
              className={cn(
                "relative border-border/60 bg-card shadow-none transition-shadow",
                plan.highlighted && "border-primary/50 shadow-md ring-1 ring-primary/20",
              )}
              size="sm"
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="rounded-full px-3" variant="default">
                    {t("pricing.recommended")}
                  </Badge>
                </div>
              )}
              <CardContent className="flex h-full flex-col gap-5 py-5">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Mail className="size-4 text-muted-foreground" />
                    <h3 className="text-base font-semibold">{plan.name}</h3>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold tracking-tight">{plan.price}</span>
                    {plan.priceUnit && (
                      <span className="text-sm text-muted-foreground">{plan.priceUnit}</span>
                    )}
                  </div>
                  <p className="text-[11px] leading-5 text-muted-foreground">{plan.description}</p>
                </div>

                <ul className="flex-1 space-y-2.5">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  className="w-full"
                  size="sm"
                  variant={plan.highlighted ? "default" : "outline"}
                >
                  {plan.ctaHref.startsWith("http") || plan.ctaHref.startsWith("mailto") ? (
                    <a href={plan.ctaHref} target="_blank" rel="noopener noreferrer">
                      {plan.cta}
                    </a>
                  ) : (
                    <Link to={plan.ctaHref}>{plan.cta}</Link>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </PublicSection>

      <Card className="border-border/60 bg-card shadow-none" size="sm">
        <CardContent className="py-5 text-center">
          <p className="text-sm font-medium">{t("pricing.faqTitle")}</p>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            {t("pricing.faqBody")}
          </p>
          <Button asChild className="mt-3" size="sm" variant="outline">
            <Link to="/faq">{t("pricing.faqLink")}</Link>
          </Button>
        </CardContent>
      </Card>

      <PublicBottomCta />
    </PublicShell>
  );
}
