package usecase

import (
	"github.com/robbinsz/bgeo/internal/config"
	"github.com/robbinsz/bgeo/internal/connector/ai"
	"github.com/robbinsz/bgeo/internal/domain"
	"github.com/robbinsz/bgeo/internal/repository"
	"github.com/robbinsz/bgeo/pkg/ruleengine"
	"gorm.io/gorm"
)

type Runtime struct {
	Monitor   *MonitorUsecase
	Content   *ContentUsecase
	Evolution *EvolutionUsecase
	Copilot   *CopilotUsecase
	Jobs      *repository.JobRepository
}

func NewRuntime(db *gorm.DB, hub domain.EventSink) *Runtime {
	project := repository.NewProjectRepository(db)
	monitor := repository.NewMonitorRepository(db)
	opportunity := repository.NewOpportunityRepository(db)
	content := repository.NewContentRepository(db)
	monitorUC := NewMonitorUsecase(monitor, opportunity, ai.NewPerplexityConnector(), hub)
	contentUC := NewContentUsecase(content, project)
	return &Runtime{
		Monitor:   monitorUC,
		Content:   contentUC,
		Evolution: NewEvolutionUsecase(repository.NewEvolutionRepository(db), ruleengine.NewEvaluator(), hub),
		Copilot:   NewCopilotUsecase(repository.NewCopilotRepository(db), repository.NewHarnessRepository(db), monitorUC, contentUC, monitor, opportunity, project, content, hub),
		Jobs:      repository.NewJobRepository(db),
	}
}
func NewWorker(db *gorm.DB, cfg config.Config, hub domain.EventSink) *Worker {
	runtime := NewRuntime(db, hub)
	return &Worker{DB: db, Jobs: runtime.Jobs, Monitor: runtime.Monitor, Evolution: runtime.Evolution, Copilot: runtime.Copilot, Config: cfg}
}
