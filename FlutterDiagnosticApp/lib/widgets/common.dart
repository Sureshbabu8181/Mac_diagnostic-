import 'package:flutter/material.dart';
import '../models/diagnostics.dart';

/// Small colored badge showing a verdict label.
class StatusBadge extends StatelessWidget {
  final DiagnosticStatus status;
  final bool compact;
  const StatusBadge({super.key, required this.status, this.compact = false});

  @override
  Widget build(BuildContext context) {
    final color = status.color(context);
    return Container(
      padding: EdgeInsets.symmetric(horizontal: compact ? 6 : 10, vertical: compact ? 2 : 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withValues(alpha: 0.5), width: 1),
      ),
      child: Text(
        status.label,
        style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: compact ? 10 : 12),
      ),
    );
  }
}

/// One module card on the home screen.
class ModuleCard extends StatelessWidget {
  final DiagnosticKind kind;
  final DiagnosticStatus? status;
  final VoidCallback onTap;
  const ModuleCard({super.key, required this.kind, required this.onTap, this.status});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      elevation: status == null ? 0 : 1,
      color: theme.colorScheme.surfaceContainerLow,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(kind.icon, color: theme.colorScheme.primary),
                  const Spacer(),
                  if (status != null) StatusBadge(status: status!, compact: true),
                ],
              ),
              const SizedBox(height: 10),
              Text(kind.displayName, style: theme.textTheme.titleSmall),
              const SizedBox(height: 2),
              Text(
                kind.isManual ? 'Manual' : 'Automated',
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A list row on the home page.
class ModuleTile extends StatelessWidget {
  final DiagnosticKind kind;
  final DiagnosticStatus? status;
  final VoidCallback onTap;
  const ModuleTile({super.key, required this.kind, required this.onTap, this.status});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(kind.icon),
      title: Text(kind.displayName),
      subtitle: Text(kind.isManual ? 'Manual' : 'Automated'),
      trailing: status == null
          ? const Icon(Icons.chevron_right)
          : Row(
              mainAxisSize: MainAxisSize.min,
              children: [StatusBadge(status: status!), const SizedBox(width: 4)],
            ),
      onTap: onTap,
    );
  }
}

/// Test-page action button. When the Settings toggle is on it uses an accent
/// (filled) background; when off, a plain/neutral background.
class AccentButton extends StatelessWidget {
  final String label;
  final IconData? icon;
  final VoidCallback? onPressed;
  final bool accent;
  final Color? color;
  final bool enabled;
  const AccentButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.accent = true,
    this.color,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final effectiveColor = color ?? theme.colorScheme.primary;
    if (accent) {
      return FilledButton.icon(
        onPressed: enabled ? onPressed : null,
        style: FilledButton.styleFrom(backgroundColor: effectiveColor),
        icon: icon == null ? const SizedBox.shrink() : Icon(icon),
        label: Text(label),
      );
    }
    return OutlinedButton.icon(
      onPressed: enabled ? onPressed : null,
      style: OutlinedButton.styleFrom(
        foregroundColor: effectiveColor,
        side: BorderSide(color: effectiveColor.withValues(alpha: 0.6)),
      ),
      icon: icon == null ? const SizedBox.shrink() : Icon(icon),
      label: Text(label),
    );
  }
}

/// Verdict footer (PASS / FAIL / SKIP) with technician notes.
class VerdictBar extends StatelessWidget {
  final bool accent;
  final TextEditingController notes;
  final VoidCallback onPass;
  final VoidCallback onFail;
  final VoidCallback onSkip;
  final bool enabled;
  const VerdictBar({
    super.key,
    required this.accent,
    required this.notes,
    required this.onPass,
    required this.onFail,
    required this.onSkip,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Technician Notes', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
        const SizedBox(height: 6),
        TextField(
          controller: notes,
          maxLines: 2,
          decoration: const InputDecoration(border: OutlineInputBorder(), isDense: true),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            AccentButton(label: 'PASS', onPressed: enabled ? onPass : null, accent: accent, color: const Color(0xFF2E7D32), icon: Icons.check),
            const SizedBox(width: 8),
            AccentButton(label: 'FAIL', onPressed: enabled ? onFail : null, accent: accent, color: const Color(0xFFC62828), icon: Icons.close),
            const SizedBox(width: 8),
            OutlinedButton(onPressed: enabled ? onSkip : null, child: const Text('SKIP')),
          ],
        ),
      ],
    );
  }
}

/// Renders a metrics map as a two-column grid.
class MetricsGrid extends StatelessWidget {
  final Map<String, String> metrics;
  const MetricsGrid({super.key, required this.metrics});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final entries = metrics.entries.toList();
    return Column(
      children: [
        for (var i = 0; i < entries.length; i++)
          Container(
            decoration: BoxDecoration(
              color: i.isEven ? theme.colorScheme.surfaceContainerHighest : null,
              border: Border(bottom: BorderSide(color: theme.dividerColor, width: 0.5)),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 150,
                  child: Text(entries[i].key, style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600)),
                ),
                Expanded(child: Text(entries[i].value, style: theme.textTheme.bodySmall)),
              ],
            ),
          ),
      ],
    );
  }
}