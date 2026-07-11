import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { MergeEligibility } from "../../lib/segmentMerge.js";
import { styles } from "./ActionsGroup.styles.js";

export interface ActionsGroupProps {
  mergeEligibility: MergeEligibility;
  onMergeNext: () => void;
  onSplit: () => void;
  onDuplicate: () => void;
  onSetIntro: () => void;
  onSetOutro: () => void;
  tooLongForIntroOutro: boolean;
  introOutroDisabledTitle: string | null;
}

/**
 * G8. Cut actions - one row: [Split] [Merge with next cut] [Duplicate] [Set as intro] [Set as
 * outro]. No primary in this row - none of these five is a dominant/default action (screen-spec
 * section 4). Delete lives separately in the panel's own danger zone, not here.
 */
export function ActionsGroup({
  mergeEligibility,
  onMergeNext,
  onSplit,
  onDuplicate,
  onSetIntro,
  onSetOutro,
  tooLongForIntroOutro,
  introOutroDisabledTitle,
}: ActionsGroupProps) {
  return (
    <VStack gap={1.5} xstyle={styles.groupBorder} data-testid="cut-settings-group-actions">
      <Text type="label" color="secondary" weight="semibold" xstyle={styles.groupLabel}>
        Cut actions
      </Text>
      <HStack gap={2} wrap="wrap">
        <Button
          label="Split"
          variant="secondary"
          size="sm"
          tooltip="Cmd/Ctrl + B"
          onClick={onSplit}
          data-testid="cut-action-split"
        />
        <Button
          label="Merge with next cut"
          variant="secondary"
          size="sm"
          isDisabled={!mergeEligibility.eligible}
          tooltip={mergeEligibility.eligible ? "Cmd/Ctrl + J" : mergeEligibility.reason}
          onClick={onMergeNext}
          data-testid="cut-action-merge"
        />
        <Button
          label="Duplicate"
          variant="secondary"
          size="sm"
          onClick={onDuplicate}
          data-testid="cut-action-duplicate"
        />
        <Button
          label="Set as intro"
          variant="ghost"
          size="sm"
          isDisabled={tooLongForIntroOutro}
          tooltip={introOutroDisabledTitle ?? "Range (In/Out) is ignored - the whole clip is inserted as the intro"}
          onClick={onSetIntro}
          data-testid="cut-action-set-intro"
        />
        <Button
          label="Set as outro"
          variant="ghost"
          size="sm"
          isDisabled={tooLongForIntroOutro}
          tooltip={introOutroDisabledTitle ?? "Range (In/Out) is ignored - the whole clip is inserted as the outro"}
          onClick={onSetOutro}
          data-testid="cut-action-set-outro"
        />
      </HStack>
    </VStack>
  );
}
