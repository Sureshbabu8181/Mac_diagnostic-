using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Media;
using System.Windows.Xps;
using WindowsLaptopDiagnostics.Core;
using WindowsLaptopDiagnostics.Infrastructure;

namespace WindowsLaptopDiagnostics.Services;

/// <summary>
/// Export of archived results to CSV, self-contained HTML and PDF.
///
/// CSV and HTML are written directly to disk and contain only what was actually
/// recorded - no field is invented, and empty readings stay empty rather than
/// being defaulted to zero.
///
/// PDF uses Windows print-to-PDF, so the technician chooses the destination.
/// If no PDF-capable printer exists that is reported honestly rather than
/// silently substituting another format.
/// </summary>
public static class ReportService
{
    // ------------------------------------------------------------------ //
    // CSV
    // ------------------------------------------------------------------ //

    public static string ExportCsv(IReadOnlyList<HistoryEntry> entries, string path)
    {
        var sb = new StringBuilder();
        sb.AppendLine("Timestamp (local),Test,Category,Status,Duration (s),Summary,Readings,Warnings,Errors,User confirmed");

        foreach (var e in entries)
        {
            sb.Append(Csv(e.WhenLocal.ToString("yyyy-MM-dd HH:mm:ss"))).Append(',');
            sb.Append(Csv(e.TestName)).Append(',');
            sb.Append(Csv(e.Category)).Append(',');
            sb.Append(Csv(e.Status)).Append(',');
            sb.Append(Csv(e.DurationSeconds?.ToString("0.0") ?? "")).Append(',');
            sb.Append(Csv(e.Summary)).Append(',');
            sb.Append(Csv(string.Join("; ", e.Readings.Select(r => $"{r.Key}={r.Value}")))).Append(',');
            sb.Append(Csv(string.Join("; ", e.Warnings))).Append(',');
            sb.Append(Csv(string.Join("; ", e.Errors))).Append(',');
            sb.Append(Csv(e.UserConfirmed ? "yes" : "no"));
            sb.AppendLine();
        }

        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, sb.ToString(), new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));
        return path;
    }

    /// <summary>RFC 4180 quoting: wrap in quotes and double any inner quote.</summary>
    private static string Csv(string? v)
    {
        v ??= "";
        if (v.Contains('"') || v.Contains(',') || v.Contains('\n') || v.Contains('\r'))
            return "\"" + v.Replace("\"", "\"\"") + "\"";
        return v;
    }

    // ------------------------------------------------------------------ //
    // HTML (self-contained: no external CSS, images or scripts)
    // ------------------------------------------------------------------ //

    public static string ExportHtml(IReadOnlyList<HistoryEntry> entries, string path, string title)
    {
        var sb = new StringBuilder();
        sb.AppendLine("<!DOCTYPE html>");
        sb.AppendLine("<html lang=\"en\"><head><meta charset=\"utf-8\">");
        sb.AppendLine($"<title>{H(title)}</title>");
        sb.AppendLine("<style>");
        sb.AppendLine("body{font-family:Segoe UI,Arial,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:32px}");
        sb.AppendLine("h1{font-size:22px;margin:0 0 4px} .sub{color:#94a3b8;font-size:13px;margin-bottom:24px}");
        sb.AppendLine("table{border-collapse:collapse;width:100%;font-size:13px}");
        sb.AppendLine("th,td{border:1px solid #334155;padding:8px 10px;text-align:left;vertical-align:top}");
        sb.AppendLine("th{background:#1e293b;color:#94a3b8;font-weight:600}");
        sb.AppendLine("tr:nth-child(even){background:#16213a}");
        sb.AppendLine(".Passed{color:#22c55e}.Warning{color:#f59e0b}.Failed,.Error{color:#ef4444}");
        sb.AppendLine(".Unsupported{color:#a855f7}.Cancelled{color:#94a3b8}.NotRun{color:#64748b}");
        sb.AppendLine(".mono{font-family:Consolas,monospace}");
        sb.AppendLine("</style></head><body>");
        sb.AppendLine($"<h1>{H(title)}</h1>");
        sb.AppendLine($"<div class=\"sub\">Generated {H(DateTime.Now.ToString("yyyy-MM-dd HH:mm"))} · " +
                      $"{entries.Count} result(s) · read-only diagnostic record</div>");

        sb.AppendLine("<table><thead><tr>" +
                      "<th>Time</th><th>Test</th><th>Status</th><th>Duration</th>" +
                      "<th>Summary</th><th>Readings</th><th>Warnings</th><th>Errors</th>" +
                      "</tr></thead><tbody>");

        foreach (var e in entries)
        {
            string cls = e.Status.Replace(" ", "");
            sb.Append("<tr>")
              .Append($"<td class=\"mono\">{H(e.WhenLocal.ToString("MM-dd HH:mm:ss"))}</td>")
              .Append($"<td>{H(e.TestName)}<br><span style=\"color:#94a3b8\">{H(e.Category)}</span></td>")
              .Append($"<td class=\"{cls}\"><b>{H(e.Status)}</b>{(e.UserConfirmed ? "<br><span style=\"color:#94a3b8\">user confirmed</span>" : "")}</td>")
              .Append($"<td class=\"mono\">{(e.DurationSeconds is { } d ? d.ToString("0.0") + " s" : "")}</td>")
              .Append($"<td>{H(e.Summary)}</td>")
              .Append($"<td class=\"mono\">{string.Join("<br>", e.Readings.Select(r => $"{H(r.Key)} = {H(r.Value)}"))}</td>")
              .Append($"<td>{string.Join("<br>", e.Warnings.Select(H))}</td>")
              .Append($"<td>{string.Join("<br>", e.Errors.Select(H))}</td>")
              .AppendLine("</tr>");
        }

        sb.AppendLine("</tbody></table>");
        sb.AppendLine("<p style=\"color:#94a3b8;font-size:12px;margin-top:20px\">");
        sb.AppendLine("Every value above was recorded because a check actually ran and produced it. " +
                      "Skipped, unsupported or cancelled checks are shown as such and are never counted as passing.</p>");
        sb.AppendLine("</body></html>");

        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, sb.ToString(), new UTF8Encoding(false));
        return path;
    }

    private static string H(string? s) =>
        (s ?? "").Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;");

    // ------------------------------------------------------------------ //
    // PDF via Windows print-to-PDF
    // ------------------------------------------------------------------ //

    /// <summary>
    /// Renders the results as a paginated document through the Windows print
    /// pipeline, so "Microsoft Print to PDF" (or any driver) produces the file.
    /// The technician picks the destination; the returned path may be empty
    /// when the driver does not report one.
    /// </summary>
    public static (bool Ok, string Path, string Detail) ExportPdf(
        IReadOnlyList<HistoryEntry> entries, string suggestedName)
    {
        try
        {
            var doc = BuildFlowDocument(entries, suggestedName);

            var dlg = new PrintDialog();
            if (dlg.ShowDialog() != true)
                return (false, "", "Print dialog cancelled - no PDF was produced.");

            var paginator = ((IDocumentPaginatorSource)doc).DocumentPaginator;
            double w = dlg.PrintableAreaWidth, h = dlg.PrintableAreaHeight;
            if (double.IsNaN(w) || w <= 0) w = 816;   // 8.5 in at 96 dpi
            if (double.IsNaN(h) || h <= 0) h = 1056;  // 11 in at 96 dpi
            paginator.PageSize = new Size(w, h);

            string printer = dlg.PrintQueue?.Name ?? "the selected printer";
            dlg.PrintDocument(paginator, suggestedName);
            return (true, printer,
                $"Sent to printer '{printer}'. Choose 'Microsoft Print to PDF' to save a PDF file.");
        }
        catch (Exception ex)
        {
            Logger.Error("PDF export failed", ex);
            return (false, "", $"PDF export failed: {ex.Message}");
        }
    }

    private static FlowDocument BuildFlowDocument(IReadOnlyList<HistoryEntry> entries, string title)
    {
        var doc = new FlowDocument
        {
            FontFamily = new FontFamily("Segoe UI"),
            FontSize = 11,
            PagePadding = new Thickness(36),
            ColumnWidth = double.PositiveInfinity,
        };

        doc.Blocks.Add(new Paragraph(new Run(title))
        {
            FontSize = 20,
            FontWeight = FontWeights.SemiBold,
            Margin = new Thickness(0, 0, 0, 4),
        });
        doc.Blocks.Add(new Paragraph(new Run(
            $"{DateTime.Now:yyyy-MM-dd HH:mm}  ·  {entries.Count} result(s)  ·  read-only diagnostic record"))
        {
            FontSize = 10,
            Foreground = Brushes.Gray,
            Margin = new Thickness(0, 0, 0, 14),
        });

        if (entries.Count == 0)
        {
            doc.Blocks.Add(new Paragraph(new Run("No results have been recorded yet.")));
            return doc;
        }

        var table = new Table
        {
            CellSpacing = 0,
            BorderThickness = new Thickness(1),
            BorderBrush = Brushes.LightGray,
        };
        table.Columns.Add(new TableColumn { Width = new GridLength(78) });
        table.Columns.Add(new TableColumn { Width = new GridLength(110) });
        table.Columns.Add(new TableColumn { Width = new GridLength(60) });
        table.Columns.Add(new TableColumn { Width = new GridLength(360) });

        var hsg = new TableRowGroup();
        foreach (string h in new[] { "Time", "Test", "Status", "Summary / readings" })
            hsg.Rows.Add(new TableRow
            {
                Cells =
                {
                    new TableCell(new Paragraph(new Run(h))
                    {
                        FontWeight = FontWeights.SemiBold,
                        Margin = new Thickness(4, 2, 4, 2),
                    })
                    {
                        Background = Brushes.WhiteSmoke,
                        Padding = new Thickness(2),
                    },
                },
            });
        table.RowGroups.Add(hsg);

        foreach (var e in entries)
        {
            var row = new TableRow();
            row.Cells.Add(Cell(e.WhenLocal.ToString("MM-dd HH:mm:ss")));
            row.Cells.Add(Cell($"{e.TestName}\n{e.Category}"));
            row.Cells.Add(Cell(e.Status + (e.UserConfirmed ? " *" : "")));

            var detail = e.Summary;
            if (e.Readings.Count > 0)
                detail += "\n" + string.Join("\n", e.Readings.Select(r => $"{r.Key} = {r.Value}"));
            if (e.Warnings.Count > 0)
                detail += "\nWarnings: " + string.Join("; ", e.Warnings);
            if (e.Errors.Count > 0)
                detail += "\nErrors: " + string.Join("; ", e.Errors);
            row.Cells.Add(Cell(detail));

            table.RowGroups[0].Rows.Add(row);
        }

        doc.Blocks.Add(table);
        doc.Blocks.Add(new Paragraph(new Run(
            "* user confirmed an observation. Skipped, unsupported and cancelled checks are recorded as " +
            "themselves and are never counted as passing."))
        {
            FontSize = 9,
            Foreground = Brushes.Gray,
            Margin = new Thickness(0, 10, 0, 0),
        });
        return doc;

        static TableCell Cell(string text) => new(new Paragraph(new Run(text))
        {
            Margin = new Thickness(4, 2, 4, 2),
        });
    }
}
