import type { ReactNode } from "react";
import { Section } from "@astryxdesign/core/Section";
import { Grid } from "@astryxdesign/core/Grid";
import { VStack } from "@astryxdesign/core/VStack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { styles } from "./FinishSettingsSection.styles.js";

export interface FinishSettingsSectionProps {
  heading: string;
  description?: string;
  /** Bottom divider separating this section from the next one - off for the last section in a group. */
  hasDivider?: boolean;
  /** The fields column (right side of the heading|fields grid). */
  children: ReactNode;
  "data-testid"?: string;
}

/**
 * The Finish (Export) step's settings-section shell — Astryx's "Settings Form" page template
 * structure (`astryx template settings`): a `Section` (not Card - Card.doc.mjs is explicit that
 * page regions like this use Section) containing a two-column `Grid` (heading/description on the
 * left, fields on the right), separated from the next section by a bottom divider. Every Finish
 * section (Project, Subtitle style, Subtitle style presets, Intro/outro) composes this instead of
 * hand-rolling its own full-width card - this is the one place that shape lives, so a tweak to the
 * section chrome only needs to happen here.
 */
export function FinishSettingsSection({
  heading,
  description,
  hasDivider = true,
  children,
  "data-testid": testId,
}: FinishSettingsSectionProps) {
  return (
    <Section variant="section" padding={4} dividers={hasDivider ? ["bottom"] : undefined} data-testid={testId}>
      <Grid columns={2} gap={8} xstyle={styles.grid}>
        <VStack gap={1}>
          <Heading level={2}>{heading}</Heading>
          {description ? (
            <Text type="supporting" color="secondary">
              {description}
            </Text>
          ) : null}
        </VStack>
        <VStack gap={3}>{children}</VStack>
      </Grid>
    </Section>
  );
}
