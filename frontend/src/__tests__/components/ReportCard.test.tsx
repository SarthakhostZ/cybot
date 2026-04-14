  path:       "reports/user-123/threat-report.pdf",
  size:       204800,   // 200 KB
  created_at: "2024-03-15T10:00:00Z",
};

describe("ReportCard", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders filename and formatted size", () => {
    const { getByText } = render(<ReportCard report={BASE_REPORT} />);